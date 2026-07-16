<?php
/**
 * Online forms engine (admin-managed).
 *
 * Forms are created and edited from wp-admin (AWIVEST > Online Forms) and stored
 * in the database, so the flow can be changed any time without code edits. Members
 * fill them on the portal with SAVE PROGRESS + submit, and sign each form by
 * drawing or uploading a signature.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Forms {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'handle' ) );
		add_action( 'admin_menu', array( $this, 'admin_menu' ), 11 );
		add_action( 'admin_init', array( $this, 'admin_handle' ) );
	}

	public static function field_types() {
		return array( 'text', 'email', 'tel', 'date', 'number', 'textarea', 'select', 'checkbox' );
	}

	/* ---------------- Form definitions (DB-backed) ---------------- */

	public static function all_defs() {
		global $wpdb;
		return $wpdb->get_results( 'SELECT * FROM ' . AWIVEST_DB::form_defs() . ' ORDER BY sort_order ASC, id ASC' );
	}

	public static function active_defs() {
		global $wpdb;
		return $wpdb->get_results( 'SELECT * FROM ' . AWIVEST_DB::form_defs() . " WHERE status = 'active' ORDER BY sort_order ASC, id ASC" );
	}

	public static function get_def( $slug ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::form_defs() . ' WHERE slug = %s', $slug ) );
	}

	public static function def_fields( $def ) {
		if ( ! $def || empty( $def->fields ) ) {
			return array();
		}
		$fields = json_decode( $def->fields, true );
		return is_array( $fields ) ? $fields : array();
	}

	/**
	 * Seed the standard forms once (on activation / upgrade) if none exist yet.
	 */
	public static function seed_defaults() {
		global $wpdb;
		$count = (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . AWIVEST_DB::form_defs() );
		if ( $count > 0 ) {
			return;
		}
		$seed = array(
			array(
				'slug'  => 'investor_registration',
				'title' => 'Investor Registration Form',
				'fields'=> array(
					array( 'key' => 'full_name', 'label' => 'Full Name', 'type' => 'text', 'required' => true, 'options' => array() ),
					array( 'key' => 'id_number', 'label' => 'National ID / Passport No.', 'type' => 'text', 'required' => true, 'options' => array() ),
					array( 'key' => 'dob', 'label' => 'Date of Birth', 'type' => 'date', 'required' => false, 'options' => array() ),
					array( 'key' => 'nationality', 'label' => 'Nationality', 'type' => 'text', 'required' => false, 'options' => array() ),
					array( 'key' => 'phone', 'label' => 'Phone', 'type' => 'tel', 'required' => false, 'options' => array() ),
					array( 'key' => 'occupation', 'label' => 'Occupation', 'type' => 'text', 'required' => false, 'options' => array() ),
					array( 'key' => 'source_of_funds', 'label' => 'Source of Funds', 'type' => 'select', 'required' => false, 'options' => array( 'Employment', 'Business', 'Investment Income', 'Inheritance', 'Other' ) ),
				),
			),
			array(
				'slug'  => 'kyc',
				'title' => 'KYC Form',
				'fields'=> array(
					array( 'key' => 'id_type', 'label' => 'ID Type', 'type' => 'select', 'required' => true, 'options' => array( 'National ID', 'Passport', 'Alien ID' ) ),
					array( 'key' => 'id_number', 'label' => 'ID Number', 'type' => 'text', 'required' => true, 'options' => array() ),
					array( 'key' => 'kra_pin', 'label' => 'KRA PIN', 'type' => 'text', 'required' => false, 'options' => array() ),
					array( 'key' => 'residential_address', 'label' => 'Residential Address', 'type' => 'textarea', 'required' => false, 'options' => array() ),
					array( 'key' => 'annual_income', 'label' => 'Annual Income Range (KES)', 'type' => 'select', 'required' => false, 'options' => array( 'Below 500k', '500k - 1M', '1M - 5M', '5M - 20M', 'Above 20M' ) ),
				),
			),
			array(
				'slug'  => 'beneficiary',
				'title' => 'Beneficiary Form',
				'fields'=> array(
					array( 'key' => 'beneficiary_name', 'label' => 'Beneficiary Full Name', 'type' => 'text', 'required' => true, 'options' => array() ),
					array( 'key' => 'relationship', 'label' => 'Relationship', 'type' => 'text', 'required' => false, 'options' => array() ),
					array( 'key' => 'beneficiary_id', 'label' => 'Beneficiary ID No.', 'type' => 'text', 'required' => false, 'options' => array() ),
					array( 'key' => 'beneficiary_phone', 'label' => 'Beneficiary Phone', 'type' => 'tel', 'required' => false, 'options' => array() ),
					array( 'key' => 'allocation_percent', 'label' => 'Allocation (%)', 'type' => 'number', 'required' => false, 'options' => array() ),
				),
			),
			array(
				'slug'  => 'risk_assessment',
				'title' => 'Risk Assessment Form',
				'fields'=> array(
					array( 'key' => 'experience', 'label' => 'Investment Experience', 'type' => 'select', 'required' => true, 'options' => array( 'None', 'Limited', 'Moderate', 'Extensive' ) ),
					array( 'key' => 'risk_tolerance', 'label' => 'Risk Tolerance', 'type' => 'select', 'required' => true, 'options' => array( 'Conservative', 'Balanced', 'Aggressive' ) ),
					array( 'key' => 'horizon', 'label' => 'Investment Horizon', 'type' => 'select', 'required' => false, 'options' => array( 'Under 1 year', '1 - 3 years', '3 - 5 years', 'Over 5 years' ) ),
					array( 'key' => 'objective', 'label' => 'Primary Investment Objective', 'type' => 'textarea', 'required' => false, 'options' => array() ),
				),
			),
			array(
				'slug'  => 'compliance',
				'title' => 'Compliance Declaration',
				'fields'=> array(
					array( 'key' => 'pep_status', 'label' => 'Are you a Politically Exposed Person (PEP)?', 'type' => 'select', 'required' => true, 'options' => array( 'No', 'Yes' ) ),
					array( 'key' => 'pep_details', 'label' => 'If yes, provide details', 'type' => 'textarea', 'required' => false, 'options' => array() ),
					array( 'key' => 'source_of_wealth', 'label' => 'Source of Wealth', 'type' => 'textarea', 'required' => false, 'options' => array() ),
				),
			),
		);

		$order = 0;
		foreach ( $seed as $s ) {
			$wpdb->insert(
				AWIVEST_DB::form_defs(),
				array(
					'slug'              => $s['slug'],
					'title'             => $s['title'],
					'description'       => '',
					'fields'            => wp_json_encode( $s['fields'] ),
					'require_signature' => 1,
					'status'            => 'active',
					'sort_order'        => $order++,
					'created_at'        => current_time( 'mysql' ),
					'updated_at'        => current_time( 'mysql' ),
				)
			);
		}
	}

	/* ---------------- Front-end handling ---------------- */

	public function handle() {
		if ( empty( $_POST['awivest_action'] ) ) {
			return;
		}
		$action = sanitize_key( wp_unslash( $_POST['awivest_action'] ) );
		if ( 'form_save' !== $action && 'form_submit' !== $action ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in.' );
		}
		if ( ! isset( $_POST['awivest_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['awivest_nonce'] ) ), 'awivest_form' ) ) {
			wp_die( 'Security check failed.' );
		}

		$investor = AWIVEST_DB::current_investor();
		if ( ! $investor || 'active' !== $investor->status ) {
			wp_die( 'Your account must be approved before you can submit forms.' );
		}

		$slug = isset( $_POST['form_key'] ) ? sanitize_key( wp_unslash( $_POST['form_key'] ) ) : '';
		$def  = self::get_def( $slug );
		if ( ! $def ) {
			wp_die( 'Unknown form.' );
		}

		$submitting = ( 'form_submit' === $action );
		$fields     = self::def_fields( $def );
		$values     = array();
		$errors     = array();

		foreach ( $fields as $field ) {
			$raw = isset( $_POST[ 'f_' . $field['key'] ] ) ? wp_unslash( $_POST[ 'f_' . $field['key'] ] ) : '';
			$val = $this->sanitize_field( $field, $raw );
			if ( $submitting && ! empty( $field['required'] ) && ( '' === $val || ( 'checkbox' === $field['type'] && '1' !== $val ) ) ) {
				$errors[] = $field['label'] . ' is required.';
			}
			$values[ $field['key'] ] = $val;
		}

		// Signature handling (only required on final submit).
		$existing      = $this->get_submission( $investor->investor_id, $slug );
		$signature_rel = $existing ? $existing->signature_path : '';
		if ( $submitting && $def->require_signature ) {
			$sig = $this->store_signature( $investor->investor_id );
			if ( is_wp_error( $sig ) ) {
				$errors[] = $sig->get_error_message();
			} elseif ( '' !== $sig ) {
				$signature_rel = $sig;
			} elseif ( '' === $signature_rel ) {
				$errors[] = 'A signature is required. Draw it or upload a signature image.';
			}
		}

		if ( $submitting && $errors ) {
			AWIVEST_Auth::instance()->flash( 'error', $errors );
			wp_safe_redirect( add_query_arg( array( 'view' => 'forms', 'form' => $slug ), AWIVEST_Auth::instance()->portal_url() ) );
			exit;
		}

		$status = $submitting ? 'submitted' : 'draft';
		$this->upsert( $investor->investor_id, $slug, $values, $status, $signature_rel );

		AWIVEST_DB::log( $investor->investor_id, 'form_' . ( $submitting ? 'submit' : 'save' ), $slug );

		if ( $submitting ) {
			$copy = array(
				'Investor ' . esc_html( $investor->investor_id ) . ' submitted the ' . esc_html( $def->title ) . '.',
				'<strong>Submitted answers:</strong>',
			);
			foreach ( $fields as $cf ) {
				$cv = isset( $values[ $cf['key'] ] ) ? $values[ $cf['key'] ] : '';
				if ( 'checkbox' === $cf['type'] ) {
					$cv = ( '1' === $cv ) ? 'Yes' : 'No';
				}
				if ( '' === (string) $cv ) {
					$cv = '-';
				}
				$copy[] = '<strong>' . esc_html( $cf['label'] ) . ':</strong> ' . esc_html( $cv );
			}
			if ( '' !== (string) $signature_rel ) {
				$copy[] = 'A signature was captured with this submission.';
			}
			$copy[] = 'Review in admin: <a href="' . esc_url( admin_url( 'admin.php?page=awivest-forms' ) ) . '">Form Submissions</a>';
			AWIVEST_Notifications::send( AWIVEST_Notifications::admin_email(), 'Form submitted: ' . $def->title, $copy );
			AWIVEST_Auth::instance()->flash( 'success', array( $def->title . ' submitted successfully.' ) );
		} else {
			AWIVEST_Auth::instance()->flash( 'success', array( 'Progress saved. You can return and complete it later.' ) );
		}

		wp_safe_redirect( add_query_arg( array( 'view' => 'forms', 'form' => $slug ), AWIVEST_Auth::instance()->portal_url() ) );
		exit;
	}

	private function sanitize_field( $field, $raw ) {
		switch ( $field['type'] ) {
			case 'email':
				return sanitize_email( $raw );
			case 'textarea':
				return sanitize_textarea_field( $raw );
			case 'checkbox':
				return $raw ? '1' : '';
			case 'number':
				return is_numeric( $raw ) ? $raw : preg_replace( '/[^0-9.\-]/', '', (string) $raw );
			case 'select':
				$raw  = sanitize_text_field( $raw );
				$opts = isset( $field['options'] ) ? $field['options'] : array();
				return in_array( $raw, $opts, true ) ? $raw : '';
			default:
				return sanitize_text_field( $raw );
		}
	}

	/**
	 * Store a drawn (data URL) or uploaded signature. Returns relative path,
	 * '' when none provided, or WP_Error on failure.
	 */
	private function store_signature( $investor_id ) {
		if ( ! empty( $_FILES['signature_file']['name'] ) ) {
			$stored = AWIVEST_KYC::instance()->store_file( $_FILES['signature_file'] );
			if ( is_wp_error( $stored ) ) {
				return $stored;
			}
			return $stored['relative'];
		}
		$data = isset( $_POST['signature_data'] ) ? wp_unslash( $_POST['signature_data'] ) : '';
		if ( ! preg_match( '#^data:image/png;base64,#', $data ) ) {
			return '';
		}
		$binary = base64_decode( substr( $data, strpos( $data, ',' ) + 1 ), true );
		if ( false === $binary || strlen( $binary ) < 64 ) {
			return '';
		}
		if ( strlen( $binary ) > 2 * 1024 * 1024 ) {
			return new WP_Error( 'sig', 'Signature image is too large.' );
		}
		$base = AWIVEST_Activator::upload_basedir();
		$sub  = trailingslashit( $base ) . 'signatures';
		if ( ! file_exists( $sub ) ) {
			wp_mkdir_p( $sub );
		}
		$dest = trailingslashit( $sub ) . sanitize_file_name( $investor_id ) . '-' . time() . '.png';
		if ( false === file_put_contents( $dest, $binary ) ) {
			return new WP_Error( 'sig', 'Could not save the signature.' );
		}
		@chmod( $dest, 0640 );
		return ltrim( str_replace( trailingslashit( $base ), '', $dest ), '/' );
	}

	private function upsert( $investor_id, $slug, $values, $status, $signature_rel ) {
		global $wpdb;
		$now      = current_time( 'mysql' );
		$existing = $this->get_submission( $investor_id, $slug );
		$data     = wp_json_encode( $values );
		if ( $existing ) {
			$wpdb->update(
				AWIVEST_DB::forms(),
				array( 'data' => $data, 'status' => $status, 'signature_path' => $signature_rel, 'updated_at' => $now ),
				array( 'id' => $existing->id )
			);
		} else {
			$wpdb->insert(
				AWIVEST_DB::forms(),
				array(
					'investor_id'    => $investor_id,
					'form_key'       => $slug,
					'data'           => $data,
					'status'         => $status,
					'signature_path' => $signature_rel,
					'created_at'     => $now,
					'updated_at'     => $now,
				)
			);
		}
	}

	private function get_submission( $investor_id, $slug ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::forms() . ' WHERE investor_id = %s AND form_key = %s', $investor_id, $slug ) );
	}

	/* ---------------- Front-end view ---------------- */

	public function render_view() {
		$investor = AWIVEST_DB::current_investor();
		if ( ! $investor ) {
			return;
		}
		$current = isset( $_GET['form'] ) ? sanitize_key( wp_unslash( $_GET['form'] ) ) : '';
		if ( $current ) {
			$def = self::get_def( $current );
			if ( $def && 'active' === $def->status ) {
				$this->render_single_form( $investor, $def );
				return;
			}
		}

		$defs = self::active_defs();
		echo '<div class="awivest-card"><h2>Online Forms</h2>';
		if ( ! $defs ) {
			echo '<p>No forms are available yet.</p></div>';
			return;
		}
		echo '<table class="awivest-table"><thead><tr><th>Form</th><th>Status</th><th></th></tr></thead><tbody>';
		foreach ( $defs as $def ) {
			$sub    = $this->get_submission( $investor->investor_id, $def->slug );
			$status = $sub ? $sub->status : 'not_started';
			$url    = add_query_arg( array( 'view' => 'forms', 'form' => $def->slug ), AWIVEST_Auth::instance()->portal_url() );
			echo '<tr><td>' . esc_html( $def->title ) . '</td><td><span class="awivest-badge ' . esc_attr( $status ) . '">' . esc_html( ucfirst( str_replace( '_', ' ', $status ) ) ) . '</span></td><td><a class="awivest-btn small" href="' . esc_url( $url ) . '">' . ( $sub ? 'Continue' : 'Open' ) . '</a></td></tr>';
		}
		echo '</tbody></table></div>';
	}

	private function render_single_form( $investor, $def ) {
		$sub    = $this->get_submission( $investor->investor_id, $def->slug );
		$values = $sub && $sub->data ? json_decode( $sub->data, true ) : array();
		$values = is_array( $values ) ? $values : array();
		$locked = $sub && in_array( $sub->status, array( 'submitted', 'approved' ), true );
		$back   = add_query_arg( array( 'view' => 'forms' ), AWIVEST_Auth::instance()->portal_url() );
		$fields = self::def_fields( $def );
		?>
		<div class="awivest-card">
			<p><a href="<?php echo esc_url( $back ); ?>">&larr; All forms</a></p>
			<h2><?php echo esc_html( $def->title ); ?></h2>
			<?php if ( $def->description ) : ?><p><?php echo esc_html( $def->description ); ?></p><?php endif; ?>
			<?php if ( $sub ) : ?>
				<p>Status: <span class="awivest-badge <?php echo esc_attr( $sub->status ); ?>"><?php echo esc_html( ucfirst( $sub->status ) ); ?></span>
				<?php if ( $sub->admin_comment ) : ?> &mdash; <em><?php echo esc_html( $sub->admin_comment ); ?></em><?php endif; ?></p>
			<?php endif; ?>

			<form method="post" enctype="multipart/form-data" class="awivest-form">
				<?php wp_nonce_field( 'awivest_form', 'awivest_nonce' ); ?>
				<input type="hidden" name="form_key" value="<?php echo esc_attr( $def->slug ); ?>">
				<?php
				foreach ( $fields as $field ) {
					$this->render_field( $field, isset( $values[ $field['key'] ] ) ? $values[ $field['key'] ] : '', $locked );
				}

				if ( ! $locked && $def->require_signature ) :
					$has_sig = $sub && $sub->signature_path;
					?>
					<h3>Signature</h3>
					<p class="awivest-hint">Draw your signature below with a mouse or finger, then click Save. Or upload a signature image.</p>
					<?php if ( $has_sig ) : ?><p class="awivest-hint">A signature is already on file; sign again only to replace it.</p><?php endif; ?>
					<canvas class="awivest-sigpad" width="500" height="180"></canvas>
					<input type="hidden" name="signature_data" class="awivest-signature-data">
					<div class="awivest-sig-actions">
						<button type="button" class="awivest-btn small awivest-sig-clear">Clear</button>
					</div>
					<label>Or upload a signature image<input type="file" name="signature_file" accept=".png,.jpg,.jpeg"></label>
				<?php endif; ?>

				<?php if ( ! $locked ) : ?>
					<div class="awivest-sig-actions">
						<button type="submit" name="awivest_action" value="form_save" class="awivest-btn small">Save Progress</button>
						<button type="submit" name="awivest_action" value="form_submit" class="awivest-btn">Submit Form</button>
					</div>
				<?php else : ?>
					<p class="awivest-hint">This form has been submitted and is locked. Contact the administrator to make changes.</p>
				<?php endif; ?>
			</form>
		</div>
		<?php
	}

	private function render_field( $field, $value, $locked ) {
		$name = 'f_' . $field['key'];
		$req  = ! empty( $field['required'] ) ? ' required' : '';
		$dis  = $locked ? ' disabled' : '';
		echo '<label>' . esc_html( $field['label'] );
		switch ( $field['type'] ) {
			case 'textarea':
				echo '<textarea name="' . esc_attr( $name ) . '" rows="3"' . $dis . '>' . esc_textarea( $value ) . '</textarea>';
				break;
			case 'select':
				echo '<select name="' . esc_attr( $name ) . '"' . $dis . $req . '>';
				echo '<option value="">-- select --</option>';
				$opts = isset( $field['options'] ) ? $field['options'] : array();
				foreach ( $opts as $opt ) {
					echo '<option value="' . esc_attr( $opt ) . '"' . selected( $value, $opt, false ) . '>' . esc_html( $opt ) . '</option>';
				}
				echo '</select>';
				break;
			case 'checkbox':
				echo '</label><label class="awivest-inline"><input type="checkbox" name="' . esc_attr( $name ) . '" value="1"' . checked( $value, '1', false ) . $dis . '> ' . esc_html( $field['label'] );
				break;
			default:
				echo '<input type="' . esc_attr( $field['type'] ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( $value ) . '"' . $dis . $req . '>';
		}
		echo '</label>';
	}

	/* ---------------- Admin: builder + review ---------------- */

	public function admin_menu() {
		add_submenu_page( 'awivest', 'Online Forms', 'Online Forms', 'manage_options', 'awivest-form-builder', array( $this, 'admin_builder_page' ) );
		add_submenu_page( 'awivest', 'Form Submissions', 'Form Submissions', 'manage_options', 'awivest-forms', array( $this, 'admin_review_page' ) );
	}

	public function admin_handle() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		// Save / update a form definition.
		if ( isset( $_POST['awivest_admin_action'] ) && 'save_form_def' === $_POST['awivest_admin_action'] ) {
			check_admin_referer( 'awivest_form_def' );
			global $wpdb;
			$title  = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';
			$slug   = isset( $_POST['slug'] ) ? sanitize_title( wp_unslash( $_POST['slug'] ) ) : '';
			if ( '' === $slug ) {
				$slug = sanitize_title( $title );
			}
			$desc   = isset( $_POST['description'] ) ? sanitize_textarea_field( wp_unslash( $_POST['description'] ) ) : '';
			$status = isset( $_POST['status'] ) ? sanitize_key( $_POST['status'] ) : 'active';
			$sig    = empty( $_POST['require_signature'] ) ? 0 : 1;
			$order  = isset( $_POST['sort_order'] ) ? absint( $_POST['sort_order'] ) : 0;
			$fields = $this->parse_fields_text( isset( $_POST['fields_text'] ) ? wp_unslash( $_POST['fields_text'] ) : '' );

			if ( $title && $slug && $fields ) {
				$existing = self::get_def( $slug );
				$row      = array(
					'slug'              => $slug,
					'title'             => $title,
					'description'       => $desc,
					'fields'            => wp_json_encode( $fields ),
					'require_signature' => $sig,
					'status'            => 'inactive' === $status ? 'inactive' : 'active',
					'sort_order'        => $order,
					'updated_at'        => current_time( 'mysql' ),
				);
				if ( $existing ) {
					$wpdb->update( AWIVEST_DB::form_defs(), $row, array( 'id' => $existing->id ) );
				} else {
					$row['created_at'] = current_time( 'mysql' );
					$wpdb->insert( AWIVEST_DB::form_defs(), $row );
				}
			}
			wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-form-builder', 'updated' => 1 ), admin_url( 'admin.php' ) ) );
			exit;
		}

		// Delete a form definition.
		if ( isset( $_GET['awivest_form_delete'] ) && isset( $_GET['page'] ) && 'awivest-form-builder' === $_GET['page'] ) {
			check_admin_referer( 'awivest_form_delete' );
			global $wpdb;
			$wpdb->delete( AWIVEST_DB::form_defs(), array( 'id' => absint( $_GET['awivest_form_delete'] ) ) );
			wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-form-builder' ), admin_url( 'admin.php' ) ) );
			exit;
		}

		// Review a submitted form.
		if ( isset( $_POST['awivest_admin_action'] ) && 'review_form' === $_POST['awivest_admin_action'] ) {
			check_admin_referer( 'awivest_form_review' );
			global $wpdb;
			$id       = isset( $_POST['submission_id'] ) ? absint( $_POST['submission_id'] ) : 0;
			$decision = isset( $_POST['decision'] ) ? sanitize_key( $_POST['decision'] ) : '';
			$comment  = isset( $_POST['comment'] ) ? sanitize_textarea_field( wp_unslash( $_POST['comment'] ) ) : '';
			$status   = 'approve' === $decision ? 'approved' : 'rejected';
			$row      = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::forms() . ' WHERE id = %d', $id ) );
			if ( $row ) {
				$wpdb->update( AWIVEST_DB::forms(), array( 'status' => $status, 'admin_comment' => $comment, 'reviewed_by' => get_current_user_id(), 'reviewed_at' => current_time( 'mysql' ) ), array( 'id' => $id ) );
				$inv = AWIVEST_DB::get_investor_by_investor_id( $row->investor_id );
				if ( $inv ) {
					$user = get_user_by( 'id', $inv->wp_user_id );
					$def  = self::get_def( $row->form_key );
					if ( $user ) {
						AWIVEST_Notifications::send( $user->user_email, 'Form ' . $status, array( 'Your ' . esc_html( $def ? $def->title : $row->form_key ) . ' was ' . esc_html( $status ) . '.', $comment ? 'Note: ' . esc_html( $comment ) : '' ) );
					}
				}
				AWIVEST_DB::log( $row->investor_id, 'form_review', $status . ' ' . $row->form_key );
			}
			wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-forms', 'updated' => 1 ), admin_url( 'admin.php' ) ) );
			exit;
		}
	}

	private function parse_fields_text( $text ) {
		$fields = array();
		$used   = array();
		$lines  = preg_split( '/\r\n|\r|\n/', (string) $text );
		foreach ( $lines as $line ) {
			$line = trim( $line );
			if ( '' === $line ) {
				continue;
			}
			$parts = array_map( 'trim', explode( '|', $line ) );
			$label = $parts[0];
			if ( '' === $label ) {
				continue;
			}
			$type = isset( $parts[1] ) ? strtolower( $parts[1] ) : 'text';
			if ( ! in_array( $type, self::field_types(), true ) ) {
				$type = 'text';
			}
			$required = isset( $parts[2] ) ? in_array( strtolower( $parts[2] ), array( 'yes', 'y', 'required', 'true', '1' ), true ) : false;
			$options  = array();
			if ( 'select' === $type && isset( $parts[3] ) ) {
				$options = array_values( array_filter( array_map( 'trim', explode( ',', $parts[3] ) ) ) );
			}
			$key  = sanitize_key( str_replace( '-', '_', sanitize_title( $label ) ) );
			if ( '' === $key ) {
				$key = 'field';
			}
			$base = $key;
			$n    = 2;
			while ( in_array( $key, $used, true ) ) {
				$key = $base . '_' . $n;
				$n++;
			}
			$used[]   = $key;
			$fields[] = array( 'key' => $key, 'label' => $label, 'type' => $type, 'required' => $required, 'options' => $options );
		}
		return $fields;
	}

	private function fields_to_text( $fields ) {
		$lines = array();
		foreach ( $fields as $f ) {
			$row = $f['label'] . ' | ' . $f['type'] . ' | ' . ( ! empty( $f['required'] ) ? 'yes' : 'no' );
			if ( 'select' === $f['type'] && ! empty( $f['options'] ) ) {
				$row .= ' | ' . implode( ', ', $f['options'] );
			}
			$lines[] = $row;
		}
		return implode( "\n", $lines );
	}

	public function admin_builder_page() {
		$edit = isset( $_GET['edit'] ) ? sanitize_title( wp_unslash( $_GET['edit'] ) ) : '';
		$def  = $edit ? self::get_def( $edit ) : null;

		echo '<div class="wrap"><h1>Online Forms</h1>';
		echo '<p class="description">Create the forms members fill in on the portal. Edit them any time to change the flow.</p>';

		// Builder form.
		echo '<h2>' . ( $def ? 'Edit Form: ' . esc_html( $def->title ) : 'Add New Form' ) . '</h2>';
		echo '<form method="post">';
		wp_nonce_field( 'awivest_form_def' );
		echo '<input type="hidden" name="awivest_admin_action" value="save_form_def">';
		echo '<table class="form-table">';
		echo '<tr><th>Title</th><td><input type="text" name="title" class="regular-text" required value="' . esc_attr( $def ? $def->title : '' ) . '"></td></tr>';
		echo '<tr><th>Slug</th><td><input type="text" name="slug" class="regular-text" value="' . esc_attr( $def ? $def->slug : '' ) . '"' . ( $def ? ' readonly' : '' ) . '><p class="description">Leave blank to auto-generate from the title. Cannot be changed after creation.</p></td></tr>';
		echo '<tr><th>Description</th><td><textarea name="description" rows="2" class="large-text">' . esc_textarea( $def ? $def->description : '' ) . '</textarea></td></tr>';
		echo '<tr><th>Fields</th><td><textarea name="fields_text" rows="8" class="large-text" placeholder="Full Name | text | yes">' . esc_textarea( $def ? $this->fields_to_text( self::def_fields( $def ) ) : '' ) . '</textarea>';
		echo '<p class="description">One field per line: <code>Label | type | required | options</code><br>';
		echo 'types: ' . esc_html( implode( ', ', self::field_types() ) ) . ' &middot; required: yes/no &middot; options: comma-separated (select only)<br>';
		echo 'Example: <code>Source of Funds | select | yes | Employment, Business, Other</code></p></td></tr>';
		$sig_checked = ( ! $def || $def->require_signature ) ? ' checked' : '';
		echo '<tr><th>Require signature</th><td><label><input type="checkbox" name="require_signature" value="1"' . $sig_checked . '> Members must sign (draw or upload) before submitting</label></td></tr>';
		$status_val = $def ? $def->status : 'active';
		echo '<tr><th>Status</th><td><select name="status"><option value="active"' . selected( $status_val, 'active', false ) . '>Active (shown on portal)</option><option value="inactive"' . selected( $status_val, 'inactive', false ) . '>Inactive (hidden)</option></select></td></tr>';
		echo '<tr><th>Sort order</th><td><input type="number" name="sort_order" value="' . esc_attr( $def ? $def->sort_order : 0 ) . '" style="width:80px"></td></tr>';
		echo '</table>';
		echo '<p><button class="button button-primary">' . ( $def ? 'Update Form' : 'Create Form' ) . '</button>';
		if ( $def ) {
			echo ' <a class="button" href="' . esc_url( admin_url( 'admin.php?page=awivest-form-builder' ) ) . '">Cancel</a>';
		}
		echo '</p></form>';

		// Existing forms.
		echo '<h2>Existing Forms</h2><table class="wp-list-table widefat fixed striped"><thead><tr><th>Title</th><th>Slug</th><th>Fields</th><th>Signature</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
		$all = self::all_defs();
		if ( $all ) {
			foreach ( $all as $d ) {
				$edit_url = admin_url( 'admin.php?page=awivest-form-builder&edit=' . rawurlencode( $d->slug ) );
				$del_url  = wp_nonce_url( admin_url( 'admin.php?page=awivest-form-builder&awivest_form_delete=' . (int) $d->id ), 'awivest_form_delete' );
				echo '<tr><td>' . esc_html( $d->title ) . '</td><td>' . esc_html( $d->slug ) . '</td><td>' . count( self::def_fields( $d ) ) . '</td><td>' . ( $d->require_signature ? 'Yes' : 'No' ) . '</td><td>' . esc_html( $d->status ) . '</td><td><a href="' . esc_url( $edit_url ) . '">Edit</a> | <a href="' . esc_url( $del_url ) . '" onclick="return confirm(\'Delete this form?\')">Delete</a></td></tr>';
			}
		} else {
			echo '<tr><td colspan="6">No forms yet.</td></tr>';
		}
		echo '</tbody></table></div>';
	}

	public function admin_review_page() {
		global $wpdb;
		$rows = $wpdb->get_results( 'SELECT * FROM ' . AWIVEST_DB::forms() . " WHERE status <> 'draft' ORDER BY FIELD(status,'submitted','approved','rejected'), updated_at DESC" );
		echo '<div class="wrap"><h1>Form Submissions</h1>';
		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><th>Investor</th><th>Form</th><th>Details</th><th>Signature</th><th>Status</th><th>Review</th></tr></thead><tbody>';
		if ( $rows ) {
			foreach ( $rows as $r ) {
				$def    = self::get_def( $r->form_key );
				$values = $r->data ? json_decode( $r->data, true ) : array();
				echo '<tr><td>' . esc_html( $r->investor_id ) . '</td><td>' . esc_html( $def ? $def->title : $r->form_key ) . '</td><td><details><summary>View</summary><div style="max-width:380px">';
				if ( is_array( $values ) ) {
					foreach ( $values as $k => $v ) {
						echo '<div><strong>' . esc_html( $k ) . ':</strong> ' . esc_html( is_array( $v ) ? implode( ', ', $v ) : $v ) . '</div>';
					}
				}
				echo '</div></details></td><td>';
				echo $r->signature_path ? '<a href="' . esc_url( AWIVEST_Documents::download_url( 'form_signature', $r->id ) ) . '">View</a>' : '&mdash;';
				echo '</td><td>' . esc_html( $r->status ) . '</td><td>';
				echo '<form method="post" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
				wp_nonce_field( 'awivest_form_review' );
				echo '<input type="hidden" name="awivest_admin_action" value="review_form"><input type="hidden" name="submission_id" value="' . (int) $r->id . '">';
				echo '<input type="text" name="comment" placeholder="Comment" value="' . esc_attr( $r->admin_comment ) . '">';
				echo '<button class="button button-primary" name="decision" value="approve">Approve</button>';
				echo '<button class="button" name="decision" value="reject">Reject</button>';
				echo '</form></td></tr>';
			}
		} else {
			echo '<tr><td colspan="6">No submitted forms yet.</td></tr>';
		}
		echo '</tbody></table></div>';
	}
}
