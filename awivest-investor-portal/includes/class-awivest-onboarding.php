<?php
/**
 * Combined member sign-up wizard (2.4.0).
 *
 * One guided flow for new members that fuses data entry, document uploads and
 * signing into a single complete, signed KYC pack on the member record:
 *
 *   1. Create account (handled by AWIVEST_Auth registration)
 *   2. Personal details  -> written straight into the investor record
 *   3. Upload documents  -> passport photo, ID/passport copy, KRA certificate
 *   4. Sign all forms    -> one PandaDoc onboarding packet, pre-filled from data
 *   5. Review & submit    -> saves one complete profile, marked "submitted"
 *   6. Committee approval -> admin Approves (account becomes active) or Returns
 *                            the pack for corrections with a note, which reopens
 *                            the wizard for the member to fix and resubmit.
 *
 * The wizard is shown to any logged-in member whose account is not yet active
 * (and not archived/deactivated), replacing the old separate KYC tab and
 * agreement-review step for new members.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Onboarding {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'handle_post' ) );
	}

	/** The three required onboarding documents: key => label. */
	public static function required_docs() {
		return array(
			'passport_photo'  => 'Passport photo',
			'id_copy'         => 'Copy of National ID / Passport',
			'kra_certificate' => 'KRA PIN certificate',
		);
	}

	/** Safe property read (avoids warnings if a column is missing on old rows). */
	private static function val( $inv, $key ) {
		return ( is_object( $inv ) && isset( $inv->$key ) ) ? $inv->$key : '';
	}

	/* ---------------- Completion checks ---------------- */

	public static function details_complete( $inv ) {
		if ( ! is_object( $inv ) ) {
			return false;
		}
		foreach ( array( 'full_name', 'phone', 'id_number', 'kra_pin' ) as $f ) {
			if ( '' === (string) self::val( $inv, $f ) ) {
				return false;
			}
		}
		$dob = substr( (string) self::val( $inv, 'dob' ), 0, 10 );
		if ( '' === $dob || '0000-00-00' === $dob ) {
			return false;
		}
		if ( '' === (string) self::val( $inv, 'nok_name' ) || '' === (string) self::val( $inv, 'nok_phone' ) ) {
			return false;
		}
		return true;
	}

	public static function uploaded_doc_types( $investor_id ) {
		if ( '' === (string) $investor_id ) {
			return array();
		}
		global $wpdb;
		$types = $wpdb->get_col( $wpdb->prepare( 'SELECT DISTINCT document_type FROM ' . AWIVEST_DB::kyc() . ' WHERE investor_id = %s', $investor_id ) );
		return is_array( $types ) ? $types : array();
	}

	public static function documents_complete( $inv ) {
		if ( ! is_object( $inv ) ) {
			return false;
		}
		$have = self::uploaded_doc_types( self::val( $inv, 'investor_id' ) );
		foreach ( array_keys( self::required_docs() ) as $k ) {
			if ( ! in_array( $k, $have, true ) ) {
				return false;
			}
		}
		return true;
	}

	public static function sign_complete( $inv ) {
		if ( ! AWIVEST_Consents::esign_available() ) {
			return true; // Nothing to sign when packet signing is not configured.
		}
		$row = AWIVEST_Consents::packet_row( $inv );
		return ( $row && 'agreed' === $row->status );
	}

	public static function all_complete( $inv ) {
		return self::details_complete( $inv ) && self::documents_complete( $inv ) && self::sign_complete( $inv );
	}

	/** First incomplete step, honouring an explicit ?ostep= request when reachable. */
	public static function current_step( $inv ) {
		if ( ! self::details_complete( $inv ) ) {
			$first = 'details';
		} elseif ( ! self::documents_complete( $inv ) ) {
			$first = 'documents';
		} elseif ( ! self::sign_complete( $inv ) ) {
			$first = 'sign';
		} else {
			$first = 'review';
		}
		$req = isset( $_GET['ostep'] ) ? sanitize_key( wp_unslash( $_GET['ostep'] ) ) : '';
		if ( in_array( $req, array( 'details', 'documents', 'sign' ), true ) ) {
			return $req;
		}
		if ( 'review' === $req ) {
			return self::all_complete( $inv ) ? 'review' : $first;
		}
		return $first;
	}

	/* ---------------- Render ---------------- */

	public function render( $inv ) {
		if ( ! is_object( $inv ) ) {
			echo '<div class="awivest-card"><p>We could not find your member profile. Please contact AWIVEST.</p></div>';
			return;
		}
		$stage = (string) self::val( $inv, 'onboarding_stage' );

		echo '<div class="awivest-card">';
		echo '<h2>Complete your AWIVEST membership</h2>';
		echo '<p>Finish the steps below to create your complete membership pack. You can save each step and return to it later.</p>';
		echo '</div>';

		if ( 'submitted' === $stage ) {
			$this->render_submitted( $inv );
			return;
		}

		if ( 'returned' === $stage && '' !== (string) self::val( $inv, 'returned_reason' ) ) {
			echo '<div class="awivest-alert error"><ul><li><strong>Returned for corrections.</strong> ' . esc_html( self::val( $inv, 'returned_reason' ) ) . ' Please update the details below and submit again.</li></ul></div>';
		}

		$step = self::current_step( $inv );
		$this->render_steps_indicator( $inv, $step );

		switch ( $step ) {
			case 'documents':
				$this->step_documents( $inv );
				break;
			case 'sign':
				$this->step_sign( $inv );
				break;
			case 'review':
				$this->step_review( $inv );
				break;
			default:
				$this->step_details( $inv );
				break;
		}
	}

	private function render_steps_indicator( $inv, $current ) {
		$base  = AWIVEST_Auth::instance()->portal_url();
		$steps = array(
			'account'   => array( 'label' => '1. Account', 'done' => true, 'nav' => false ),
			'details'   => array( 'label' => '2. Personal details', 'done' => self::details_complete( $inv ), 'nav' => true ),
			'documents' => array( 'label' => '3. Documents', 'done' => self::documents_complete( $inv ), 'nav' => true ),
			'sign'      => array( 'label' => '4. Sign forms', 'done' => self::sign_complete( $inv ), 'nav' => true ),
			'review'    => array( 'label' => '5. Review & submit', 'done' => false, 'nav' => self::all_complete( $inv ) ),
		);
		echo '<div class="awivest-steps" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0">';
		foreach ( $steps as $key => $s ) {
			$style = 'display:inline-block;padding:8px 12px;border-radius:6px;border:1px solid #ccc;font-size:13px;text-decoration:none;color:#222;';
			if ( $s['done'] ) {
				$style .= 'background:#e6f4ea;border-color:#8bc7a0;';
			}
			if ( $key === $current ) {
				$style .= 'font-weight:700;border-color:#333;';
			}
			$label = $s['label'] . ( $s['done'] ? ' (done)' : '' );
			if ( $s['nav'] && $key !== $current ) {
				echo '<a href="' . esc_url( add_query_arg( 'ostep', $key, $base ) ) . '" style="' . esc_attr( $style ) . '">' . esc_html( $label ) . '</a>';
			} else {
				echo '<span style="' . esc_attr( $style ) . '">' . esc_html( $label ) . '</span>';
			}
		}
		echo '</div>';
	}

	/* ---------------- Steps ---------------- */

	private function step_details( $inv ) {
		echo '<div class="awivest-card"><h3>Step 2: Personal details</h3>';
		echo '<p>These details are saved to your member record and used to pre-fill your membership forms.</p>';
		echo '<form method="post" class="awivest-form">';
		wp_nonce_field( 'awivest_onboarding_details', 'awivest_nonce' );
		echo '<input type="hidden" name="awivest_action" value="onboarding_save_details">';

		$this->text_field( 'full_name', 'Full name', self::val( $inv, 'full_name' ), true );
		$this->text_field( 'id_number', 'National ID / Passport number', self::val( $inv, 'id_number' ), true );
		$this->text_field( 'kra_pin', 'KRA PIN', self::val( $inv, 'kra_pin' ), true );
		$this->dob_field( self::val( $inv, 'dob' ), true );
		$this->text_field( 'phone', 'Phone', self::val( $inv, 'phone' ), true );
		$this->text_field( 'postal_address', 'Postal address', self::val( $inv, 'postal_address' ), false );
		$this->text_field( 'physical_address', 'Physical address', self::val( $inv, 'physical_address' ), false );

		echo '<h4>Next of kin</h4>';
		$this->text_field( 'nok_name', 'Name', self::val( $inv, 'nok_name' ), true );
		$this->text_field( 'nok_relationship', 'Relationship', self::val( $inv, 'nok_relationship' ), false );
		$this->text_field( 'nok_phone', 'Phone', self::val( $inv, 'nok_phone' ), true );
		$this->text_field( 'nok_id', 'ID number', self::val( $inv, 'nok_id' ), false );

		echo '<h4>Beneficiary</h4>';
		$this->text_field( 'beneficiary_name', 'Name', self::val( $inv, 'beneficiary_name' ), false );
		$this->text_field( 'beneficiary_relationship', 'Relationship', self::val( $inv, 'beneficiary_relationship' ), false );
		$this->text_field( 'beneficiary_phone', 'Phone', self::val( $inv, 'beneficiary_phone' ), false );
		$this->text_field( 'beneficiary_id', 'ID number', self::val( $inv, 'beneficiary_id' ), false );

		echo '<h4>Nominee</h4>';
		$this->text_field( 'nominee_name', 'Name', self::val( $inv, 'nominee_name' ), false );
		$this->text_field( 'nominee_relationship', 'Relationship', self::val( $inv, 'nominee_relationship' ), false );
		$this->text_field( 'nominee_phone', 'Phone', self::val( $inv, 'nominee_phone' ), false );
		$this->text_field( 'nominee_id', 'ID number', self::val( $inv, 'nominee_id' ), false );

		echo '<button type="submit" class="awivest-btn">Save and continue</button>';
		echo '</form></div>';
	}

	private function step_documents( $inv ) {
		$req   = self::required_docs();
		$have  = self::uploaded_doc_types( self::val( $inv, 'investor_id' ) );
		$total = count( $req );
		$done  = count( array_intersect( array_keys( $req ), $have ) );

		echo '<div class="awivest-card"><h3>Step 3: Upload your documents</h3>';
		echo '<p>Please upload each required document, one at a time. Allowed: PDF, JPG, PNG, DOCX. Max ' . (int) get_option( 'awivest_max_upload_mb', 10 ) . 'MB each.</p>';

		// Progress checklist.
		echo '<ul class="awivest-doc-list">';
		foreach ( $req as $k => $label ) {
			$ok = in_array( $k, $have, true );
			echo '<li>' . esc_html( $label ) . ' ' . ( $ok ? '<span class="awivest-doc-ok">&#10003; Uploaded</span>' : '<span class="awivest-doc-missing">&#10007; Not uploaded</span>' ) . '</li>';
		}
		echo '</ul>';

		// First still-pending document.
		$next = '';
		foreach ( $req as $k => $label ) {
			if ( ! in_array( $k, $have, true ) ) {
				$next = $k;
				break;
			}
		}

		if ( '' !== $next ) {
			echo '<p><strong>Document ' . ( (int) $done + 1 ) . ' of ' . (int) $total . ': ' . esc_html( $req[ $next ] ) . '</strong></p>';
			echo '<form method="post" enctype="multipart/form-data" class="awivest-form">';
			wp_nonce_field( 'awivest_onboarding_upload', 'awivest_nonce' );
			echo '<input type="hidden" name="awivest_action" value="onboarding_upload_doc">';
			echo '<input type="hidden" name="doc_key" value="' . esc_attr( $next ) . '">';
			echo '<label>' . esc_html( $req[ $next ] ) . '<input type="file" name="doc_file" accept=".pdf,.jpg,.jpeg,.png,.docx" required></label>';
			echo '<button type="submit" class="awivest-btn">Upload and continue</button>';
			echo '</form>';
		} else {
			echo '<p>All documents uploaded. You can replace any file below, or continue.</p>';
			echo '<table class="awivest-table"><tbody>';
			foreach ( $req as $k => $label ) {
				echo '<tr><td>' . esc_html( $label ) . '</td><td>';
				echo '<form method="post" enctype="multipart/form-data" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">';
				wp_nonce_field( 'awivest_onboarding_upload', 'awivest_nonce' );
				echo '<input type="hidden" name="awivest_action" value="onboarding_upload_doc">';
				echo '<input type="hidden" name="doc_key" value="' . esc_attr( $k ) . '">';
				echo '<input type="file" name="doc_file" accept=".pdf,.jpg,.jpeg,.png,.docx" required>';
				echo '<button type="submit" class="awivest-btn small">Replace</button>';
				echo '</form></td></tr>';
			}
			echo '</tbody></table>';
			echo '<p><a class="awivest-btn" href="' . esc_url( add_query_arg( 'ostep', 'sign', AWIVEST_Auth::instance()->portal_url() ) ) . '">Continue to signing</a></p>';
		}
		echo '</div>';
	}

	private function step_sign( $inv ) {
		echo '<div class="awivest-card"><h3>Step 4: Sign your forms</h3>';
		if ( ! AWIVEST_Consents::esign_available() ) {
			echo '<p class="awivest-muted">Electronic signing is not enabled yet. You can continue to review and submit.</p>';
			echo '<p><a class="awivest-btn" href="' . esc_url( add_query_arg( 'ostep', 'review', AWIVEST_Auth::instance()->portal_url() ) ) . '">Continue</a></p></div>';
			return;
		}

		$docs = AWIVEST_Consents::agreement_docs();
		if ( $docs ) {
			echo '<p><strong>Forms included in this packet:</strong></p><ul class="awivest-doc-list">';
			foreach ( $docs as $d ) {
				echo '<li><a href="' . esc_url( AWIVEST_Documents::download_url( 'document', $d->id ) ) . '" target="_blank" rel="noopener">' . esc_html( $d->title ) . '</a></li>';
			}
			echo '</ul>';
		}

		$packet = AWIVEST_Consents::packet_row( $inv );
		// Auto-detect completion when the member returns after signing, so they
		// usually do not even need to click "I have signed - refresh status".
		// Throttled to at most one PandaDoc check per 30s per packet, so repeated
		// page loads never pile up slow outbound calls (which can exhaust shared
		// hosting entry processes and surface as 503 errors).
		if ( $packet && 'sent' === $packet->status && ! empty( $packet->pandadoc_id ) ) {
			$sync_key = 'awivest_syncchk_' . md5( (string) $packet->pandadoc_id );
			if ( false === get_transient( $sync_key ) ) {
				set_transient( $sync_key, 1, 30 );
				if ( AWIVEST_PandaDoc::instance()->sync_onboarding_status( $inv ) ) {
					$packet = AWIVEST_Consents::packet_row( $inv );
				}
			}
		}
		$status = $packet ? $packet->status : '';
		if ( 'agreed' === $status ) {
			echo '<p>Your agreement packet is signed. You can continue.</p>';
			echo '<p><a class="awivest-btn" href="' . esc_url( add_query_arg( 'ostep', 'review', AWIVEST_Auth::instance()->portal_url() ) ) . '">Continue</a></p>';
		} elseif ( 'sent' === $status && ! empty( $packet->pandadoc_id ) ) {
			$sign_url = wp_nonce_url( add_query_arg( 'awivest_onboard_sign', '1', AWIVEST_Auth::instance()->portal_url() ), 'awivest_onboard_sign' );
			$refresh  = wp_nonce_url( add_query_arg( 'awivest_onboard_refresh', '1', AWIVEST_Auth::instance()->portal_url() ), 'awivest_onboard_refresh' );
			echo '<p>Your agreement packet is ready and we have emailed you a secure signing link.</p>';
			echo '<p><a class="awivest-btn" href="' . esc_url( $sign_url ) . '" target="_blank" rel="noopener">Open &amp; e-sign now</a> ';
			echo '<a class="awivest-btn small" href="' . esc_url( $refresh ) . '">I have signed - refresh status</a></p>';
		} else {
			echo '<p>Sign all your membership forms in one packet, pre-filled from the details you entered.</p>';
			echo '<form method="post">';
			echo '<input type="hidden" name="awivest_action" value="onboarding_esign_start">';
			wp_nonce_field( 'awivest_onboarding_start', 'awivest_nonce' );
			echo '<button type="submit" class="awivest-btn">Prepare &amp; e-sign forms</button>';
			echo '</form>';
		}
		echo '</div>';
	}

	private function step_review( $inv ) {
		echo '<div class="awivest-card"><h3>Step 5: Review &amp; submit</h3>';
		echo '<p>Please review your information. If everything is correct, submit your pack for committee approval.</p>';
		$this->render_summary( $inv, true );
		echo '<form method="post" style="margin-top:16px">';
		wp_nonce_field( 'awivest_onboarding_submit', 'awivest_nonce' );
		echo '<input type="hidden" name="awivest_action" value="onboarding_submit">';
		echo '<button type="submit" class="awivest-btn">Submit for approval</button>';
		echo '</form>';
		echo '</div>';
	}

	private function render_submitted( $inv ) {
		echo '<div class="awivest-card awivest-notice">';
		echo '<h3>Submitted for approval</h3>';
		echo '<p>Thank you. Your complete membership pack has been submitted to the AWIVEST committee for approval. You will receive an email once it has been reviewed.</p>';
		echo '</div>';
		echo '<div class="awivest-card"><h4>Your submitted pack</h4>';
		$this->render_summary( $inv, false );
		echo '</div>';
	}

	/** Shared read-only summary of details + documents + signing status. */
	private function render_summary( $inv, $with_edit ) {
		$base = AWIVEST_Auth::instance()->portal_url();

		$edit = $with_edit ? ' <a href="' . esc_url( add_query_arg( 'ostep', 'details', $base ) ) . '">Edit</a>' : '';
		echo '<h4>Personal details' . $edit . '</h4>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		echo '<table class="awivest-table"><tbody>';
		$this->summary_row( 'Full name', self::val( $inv, 'full_name' ) );
		$this->summary_row( 'ID / Passport no.', self::val( $inv, 'id_number' ) );
		$this->summary_row( 'KRA PIN', self::val( $inv, 'kra_pin' ) );
		$this->summary_row( 'Date of birth', substr( (string) self::val( $inv, 'dob' ), 0, 10 ) );
		$this->summary_row( 'Phone', self::val( $inv, 'phone' ) );
		$this->summary_row( 'Postal address', self::val( $inv, 'postal_address' ) );
		$this->summary_row( 'Physical address', self::val( $inv, 'physical_address' ) );
		$this->summary_row( 'Next of kin', $this->person_line( $inv, 'nok' ) );
		$this->summary_row( 'Beneficiary', $this->person_line( $inv, 'beneficiary' ) );
		$this->summary_row( 'Nominee', $this->person_line( $inv, 'nominee' ) );
		echo '</tbody></table>';

		$edit = $with_edit ? ' <a href="' . esc_url( add_query_arg( 'ostep', 'documents', $base ) ) . '">Edit</a>' : '';
		echo '<h4>Documents' . $edit . '</h4>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		$this->render_doc_checklist( $inv );

		echo '<h4>Signed forms</h4>';
		if ( ! AWIVEST_Consents::esign_available() ) {
			echo '<p class="awivest-muted">Electronic signing is not enabled; no signature is required at this time.</p>';
		} elseif ( self::sign_complete( $inv ) ) {
			echo '<p>Your agreement packet is signed.</p>';
		} elseif ( $with_edit ) {
			echo '<p><a href="' . esc_url( add_query_arg( 'ostep', 'sign', $base ) ) . '">Sign your agreement packet</a></p>';
		} else {
			echo '<p>Not yet signed.</p>';
		}
	}

	public function render_doc_checklist( $inv ) {
		$have = self::uploaded_doc_types( self::val( $inv, 'investor_id' ) );
		echo '<ul class="awivest-doc-list">';
		foreach ( self::required_docs() as $k => $label ) {
			$ok = in_array( $k, $have, true );
			echo '<li>' . esc_html( $label ) . ' ' . ( $ok ? '<span class="awivest-doc-ok">&#10003; Uploaded</span>' : '<span class="awivest-doc-missing">&#10007; Not uploaded</span>' ) . '</li>';
		}
		echo '</ul>';
	}

	private function person_line( $inv, $prefix ) {
		$name = (string) self::val( $inv, $prefix . '_name' );
		$rel  = (string) self::val( $inv, $prefix . '_relationship' );
		$phone = (string) self::val( $inv, $prefix . '_phone' );
		if ( '' === $name ) {
			return '';
		}
		$out = $name;
		if ( '' !== $rel ) {
			$out .= ' (' . $rel . ')';
		}
		if ( '' !== $phone ) {
			$out .= ' - ' . $phone;
		}
		return $out;
	}

	private function summary_row( $label, $value ) {
		echo '<tr><th style="text-align:left;width:180px">' . esc_html( $label ) . '</th><td>' . esc_html( '' === (string) $value ? '-' : $value ) . '</td></tr>';
	}

	private function text_field( $name, $label, $value, $required ) {
		echo '<label>' . esc_html( $label ) . ( $required ? ' *' : '' ) . '<input type="text" name="' . esc_attr( $name ) . '" value="' . esc_attr( $value ) . '"' . ( $required ? ' required' : '' ) . '></label>';
	}

	private function date_field( $name, $label, $value, $required ) {
		$v = substr( (string) $value, 0, 10 );
		if ( '0000-00-00' === $v ) {
			$v = '';
		}
		echo '<label>' . esc_html( $label ) . ( $required ? ' *' : '' ) . '<input type="date" name="' . esc_attr( $name ) . '" value="' . esc_attr( $v ) . '"' . ( $required ? ' required' : '' ) . '></label>';
	}

	/**
	 * Older-user-friendly date of birth: simple Day / Month / Year dropdowns
	 * instead of a browser calendar widget (no typing, no date-format confusion).
	 */
	private function dob_field( $value, $required = true ) {
		$v  = substr( (string) $value, 0, 10 );
		$cy = '';
		$cm = '';
		$cd = '';
		if ( preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m ) ) {
			$cy = $m[1];
			$cm = $m[2];
			$cd = $m[3];
		}
		$months = array(
			'01' => 'January', '02' => 'February', '03' => 'March', '04' => 'April',
			'05' => 'May', '06' => 'June', '07' => 'July', '08' => 'August',
			'09' => 'September', '10' => 'October', '11' => 'November', '12' => 'December',
		);
		$req = $required ? ' required' : '';
		echo '<label>Date of birth' . ( $required ? ' *' : '' ) . '</label>';
		echo '<div style="display:flex;gap:8px;flex-wrap:wrap">';
		echo '<select name="dob_day"' . $req . ' style="flex:1;min-width:90px"><option value="">Day</option>';
		for ( $d = 1; $d <= 31; $d++ ) {
			$dd = str_pad( (string) $d, 2, '0', STR_PAD_LEFT );
			echo '<option value="' . esc_attr( $dd ) . '"' . selected( $cd, $dd, false ) . '>' . esc_html( (string) $d ) . '</option>';
		}
		echo '</select>';
		echo '<select name="dob_month"' . $req . ' style="flex:2;min-width:130px"><option value="">Month</option>';
		foreach ( $months as $mv => $ml ) {
			echo '<option value="' . esc_attr( $mv ) . '"' . selected( $cm, $mv, false ) . '>' . esc_html( $ml ) . '</option>';
		}
		echo '</select>';
		$max_year = (int) gmdate( 'Y' ) - 18;
		$min_year = (int) gmdate( 'Y' ) - 100;
		echo '<select name="dob_year"' . $req . ' style="flex:1;min-width:100px"><option value="">Year</option>';
		for ( $y = $max_year; $y >= $min_year; $y-- ) {
			echo '<option value="' . esc_attr( (string) $y ) . '"' . selected( $cy, (string) $y, false ) . '>' . esc_html( (string) $y ) . '</option>';
		}
		echo '</select>';
		echo '</div>';
		echo '<p class="awivest-hint">Choose the day, month and year you were born.</p>';
	}

	/* ---------------- POST handling ---------------- */

	public function handle_post() {
		$action = isset( $_POST['awivest_action'] ) ? sanitize_key( wp_unslash( $_POST['awivest_action'] ) ) : '';
		switch ( $action ) {
			case 'onboarding_save_details':
				$this->save_details();
				break;
			case 'onboarding_upload_doc':
				$this->upload_doc();
				break;
			case 'onboarding_submit':
				$this->submit();
				break;
		}
	}

	private function verify( $nonce_action ) {
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in.' );
		}
		if ( ! isset( $_POST['awivest_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['awivest_nonce'] ) ), $nonce_action ) ) {
			wp_die( 'Security check failed.' );
		}
	}

	private function flash_redirect( $type, $message, $step ) {
		AWIVEST_Auth::instance()->flash( $type, array( $message ) );
		AWIVEST_Auth::go( add_query_arg( 'ostep', $step, AWIVEST_Auth::instance()->portal_url() ) );
	}

	private function save_details() {
		$this->verify( 'awivest_onboarding_details' );
		$inv = AWIVEST_DB::current_investor();
		if ( ! $inv ) {
			wp_die( 'Investor profile not found.' );
		}

		$text_keys = array(
			'full_name', 'id_number', 'kra_pin', 'phone', 'postal_address', 'physical_address',
			'nok_name', 'nok_relationship', 'nok_phone', 'nok_id',
			'beneficiary_name', 'beneficiary_relationship', 'beneficiary_phone', 'beneficiary_id',
			'nominee_name', 'nominee_relationship', 'nominee_phone', 'nominee_id',
		);
		$fields = array();
		foreach ( $text_keys as $k ) {
			$fields[ $k ] = isset( $_POST[ $k ] ) ? sanitize_text_field( wp_unslash( $_POST[ $k ] ) ) : '';
		}
		$dob_day       = isset( $_POST['dob_day'] ) ? (int) $_POST['dob_day'] : 0;
		$dob_month     = isset( $_POST['dob_month'] ) ? (int) $_POST['dob_month'] : 0;
		$dob_year      = isset( $_POST['dob_year'] ) ? (int) $_POST['dob_year'] : 0;
		$fields['dob'] = ( $dob_year && $dob_month && $dob_day && checkdate( $dob_month, $dob_day, $dob_year ) )
			? sprintf( '%04d-%02d-%02d', $dob_year, $dob_month, $dob_day )
			: null;

		global $wpdb;
		$wpdb->update( AWIVEST_DB::investors(), $fields, array( 'investor_id' => $inv->investor_id ) );
		if ( '' !== $fields['full_name'] ) {
			wp_update_user( array( 'ID' => $inv->wp_user_id, 'display_name' => $fields['full_name'] ) );
		}
		AWIVEST_DB::log( $inv->investor_id, 'onboarding_details', '' );

		$fresh = AWIVEST_DB::current_investor();
		$next  = self::documents_complete( $fresh ) ? 'review' : 'documents';
		$this->flash_redirect( 'success', 'Personal details saved.', $next );
	}

	private function upload_doc() {
		$this->verify( 'awivest_onboarding_upload' );
		$inv = AWIVEST_DB::current_investor();
		if ( ! $inv ) {
			wp_die( 'Investor profile not found.' );
		}
		$type    = isset( $_POST['doc_key'] ) ? sanitize_key( wp_unslash( $_POST['doc_key'] ) ) : '';
		$labels  = self::required_docs();
		if ( ! array_key_exists( $type, $labels ) ) {
			$this->flash_redirect( 'error', 'Unknown document type.', 'documents' );
		}
		if ( empty( $_FILES['doc_file'] ) || empty( $_FILES['doc_file']['name'] ) ) {
			$this->flash_redirect( 'error', 'Please choose a file to upload.', 'documents' );
		}

		$stored = AWIVEST_KYC::instance()->store_file( $_FILES['doc_file'] );
		if ( is_wp_error( $stored ) ) {
			$this->flash_redirect( 'error', $stored->get_error_message(), 'documents' );
		}

		global $wpdb;
		// Keep one current file per required document: drop any previous of this type.
		$old = $wpdb->get_col( $wpdb->prepare( 'SELECT file_path FROM ' . AWIVEST_DB::kyc() . ' WHERE investor_id = %s AND document_type = %s', $inv->investor_id, $type ) );
		foreach ( (array) $old as $rel ) {
			$this->delete_stored_file( $rel );
		}
		$wpdb->delete( AWIVEST_DB::kyc(), array( 'investor_id' => $inv->investor_id, 'document_type' => $type ) );
		$wpdb->insert(
			AWIVEST_DB::kyc(),
			array(
				'investor_id'   => $inv->investor_id,
				'document_type' => $type,
				'file_path'     => $stored['relative'],
				'original_name' => $stored['original'],
				'status'        => 'pending',
				'created_at'    => current_time( 'mysql' ),
			)
		);
		$wpdb->update( AWIVEST_DB::investors(), array( 'kyc_status' => 'submitted' ), array( 'investor_id' => $inv->investor_id ) );
		AWIVEST_DB::log( $inv->investor_id, 'onboarding_doc', $type );

		// Auto-advance: go to the next pending document, or on to signing when all are in.
		$have    = self::uploaded_doc_types( $inv->investor_id );
		$pending = array();
		foreach ( array_keys( self::required_docs() ) as $rk ) {
			if ( ! in_array( $rk, $have, true ) ) {
				$pending[] = $rk;
			}
		}
		$next_step = empty( $pending ) ? 'sign' : 'documents';
		$this->flash_redirect( 'success', $labels[ $type ] . ' uploaded successfully.', $next_step );
	}

	private function delete_stored_file( $relative ) {
		if ( '' === (string) $relative ) {
			return;
		}
		$base      = AWIVEST_Activator::upload_basedir();
		$real_base = realpath( $base );
		$path      = realpath( trailingslashit( $base ) . ltrim( $relative, '/' ) );
		if ( $path && $real_base && strpos( $path, $real_base ) === 0 && is_file( $path ) ) {
			@unlink( $path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}
	}

	private function submit() {
		$this->verify( 'awivest_onboarding_submit' );
		$inv = AWIVEST_DB::current_investor();
		if ( ! $inv ) {
			wp_die( 'Investor profile not found.' );
		}
		if ( ! self::all_complete( $inv ) ) {
			$this->flash_redirect( 'error', 'Please complete all steps before submitting.', 'review' );
		}

		global $wpdb;
		$wpdb->update( AWIVEST_DB::investors(), array( 'onboarding_stage' => 'submitted', 'returned_reason' => null ), array( 'investor_id' => $inv->investor_id ) );
		AWIVEST_DB::log( $inv->investor_id, 'onboarding_submit', '' );

		$user = get_user_by( 'id', $inv->wp_user_id );
		if ( $user ) {
			AWIVEST_Notifications::send(
				$user->user_email,
				'Membership submitted',
				array( 'Thank you. Your AWIVEST membership pack has been submitted for committee approval. We will email you once it has been reviewed.' )
			);
		}
		AWIVEST_Notifications::send(
			AWIVEST_Notifications::admin_email(),
			'New membership pack submitted',
			array(
				'Investor ' . esc_html( $inv->investor_id ) . ' (' . esc_html( $inv->full_name ) . ') has submitted a complete sign-up pack for committee approval.',
				'Review and approve under AWIVEST > Investors.',
			)
		);

		AWIVEST_Auth::instance()->flash( 'success', array( 'Your membership pack has been submitted for approval.' ) );
		AWIVEST_Auth::go( AWIVEST_Auth::instance()->portal_url() );
	}
}
