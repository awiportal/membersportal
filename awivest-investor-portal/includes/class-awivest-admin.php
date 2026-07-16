<?php
/**
 * Administrator portal: dashboard metrics, investor management (with explicit
 * Approve / Deactivate / Reactivate), submission review, document library,
 * and settings (general + PandaDoc + M-Pesa).
 *
 * Feature-specific admin pages (Online Forms, Form Submissions, Opportunities,
 * Dividends, Welfare, Reports) are registered by their own classes.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Admin {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_action( 'admin_init', array( $this, 'handle_actions' ) );
	}

	public function menu() {
		add_menu_page( 'AWIVEST Portal', 'AWIVEST', 'manage_options', 'awivest', array( $this, 'page_dashboard' ), 'dashicons-shield-alt', 30 );
		add_submenu_page( 'awivest', 'Dashboard', 'Dashboard', 'manage_options', 'awivest', array( $this, 'page_dashboard' ) );
		add_submenu_page( 'awivest', 'Investors', 'Investors', 'manage_options', 'awivest-investors', array( $this, 'page_investors' ) );
		add_submenu_page( 'awivest', 'Submissions', 'Submissions', 'manage_options', 'awivest-submissions', array( $this, 'page_submissions' ) );
		add_submenu_page( 'awivest', 'Documents', 'Documents', 'manage_options', 'awivest-documents', array( $this, 'page_documents' ) );
		add_submenu_page( 'awivest', 'Settings', 'Settings', 'manage_options', 'awivest-settings', array( $this, 'page_settings' ) );
	}

	public function register_settings() {
		$g = 'awivest_settings';
		register_setting( $g, 'awivest_admin_email', array( 'sanitize_callback' => 'sanitize_email' ) );
		register_setting( $g, 'awivest_from_name', array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( $g, 'awivest_from_email', array( 'sanitize_callback' => 'sanitize_email' ) );
		register_setting( $g, 'awivest_max_upload_mb', array( 'sanitize_callback' => 'absint' ) );
		register_setting( $g, 'awivest_announcement', array( 'sanitize_callback' => 'wp_kses_post' ) );
		register_setting( $g, 'awivest_pandadoc_api_key', array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( $g, 'awivest_pandadoc_template_id', array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( $g, 'awivest_pandadoc_onboarding_template', array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( $g, 'awivest_pandadoc_role', array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( $g, 'awivest_pandadoc_webhook_secret', array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( $g, 'awivest_captcha_provider', array( 'sanitize_callback' => 'sanitize_key' ) );
		register_setting( $g, 'awivest_captcha_site_key', array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( $g, 'awivest_captcha_secret_key', array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( $g, 'awivest_mpesa_env', array( 'sanitize_callback' => 'sanitize_key' ) );
		register_setting( $g, 'awivest_mpesa_consumer_key', array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( $g, 'awivest_mpesa_consumer_secret', array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( $g, 'awivest_mpesa_shortcode', array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( $g, 'awivest_mpesa_passkey', array( 'sanitize_callback' => 'sanitize_text_field' ) );
	}

	/** Set an investor account status and email them when they become active. */
	private function set_status( $investor, $to ) {
		global $wpdb;
		if ( ! in_array( $to, array( 'active', 'deactivated' ), true ) ) {
			return;
		}
		$was = $investor->status;
		$wpdb->update( AWIVEST_DB::investors(), array( 'status' => $to ), array( 'investor_id' => $investor->investor_id ) );
		AWIVEST_DB::log( $investor->investor_id, 'status_change', $to );

		if ( 'active' === $to && 'active' !== $was ) {
			$user = get_user_by( 'id', $investor->wp_user_id );
			if ( $user ) {
				AWIVEST_Notifications::send(
					$user->user_email,
					'Account approved - now active',
					array(
						'Good news - your AWIVEST investor account has been approved and is now <strong>active</strong>.',
						'You can now log in and access all sections of the portal: online forms, documents, statements, welfare and more.',
						'Your Investor ID is ' . esc_html( $investor->investor_id ) . '.',
					)
				);
			}
		}
	}

	public function handle_actions() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		// Approve / reject a KYC submission.
		if ( isset( $_POST['awivest_admin_action'] ) && 'review_submission' === $_POST['awivest_admin_action'] ) {
			check_admin_referer( 'awivest_review' );
			global $wpdb;
			$id       = isset( $_POST['submission_id'] ) ? absint( $_POST['submission_id'] ) : 0;
			$decision = isset( $_POST['decision'] ) ? sanitize_key( $_POST['decision'] ) : '';
			$comment  = isset( $_POST['comment'] ) ? sanitize_textarea_field( wp_unslash( $_POST['comment'] ) ) : '';
			$status   = 'approve' === $decision ? 'approved' : 'rejected';

			$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::kyc() . ' WHERE id = %d', $id ) );
			if ( $row ) {
				$wpdb->update(
					AWIVEST_DB::kyc(),
					array(
						'status'        => $status,
						'admin_comment' => $comment,
						'reviewed_by'   => get_current_user_id(),
						'reviewed_at'   => current_time( 'mysql' ),
					),
					array( 'id' => $id )
				);

				$inv = AWIVEST_DB::get_investor_by_investor_id( $row->investor_id );
				if ( $inv ) {
					$wpdb->update( AWIVEST_DB::investors(), array( 'kyc_status' => $status ), array( 'investor_id' => $inv->investor_id ) );
					$user = get_user_by( 'id', $inv->wp_user_id );
					if ( $user ) {
						AWIVEST_Notifications::send(
							$user->user_email,
							'Document ' . $status,
							array(
								'Your ' . esc_html( $row->document_type ) . ' has been ' . esc_html( $status ) . '.',
								$comment ? 'Reviewer note: ' . esc_html( $comment ) : '',
							)
						);
					}
					// Approving KYC also activates the account (sends the activation email).
					if ( 'approved' === $status && 'active' !== $inv->status ) {
						$this->set_status( $inv, 'active' );
					}
				}
				AWIVEST_DB::log( $row->investor_id, 'review', $status . ' #' . $id );
			}
			$back_inv = isset( $_POST['back_investor'] ) ? sanitize_text_field( wp_unslash( $_POST['back_investor'] ) ) : '';
			if ( '' !== $back_inv ) {
				wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-investors', 'investor' => rawurlencode( $back_inv ), 'updated' => 1 ), admin_url( 'admin.php' ) ) );
				exit;
			}
			wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-submissions', 'updated' => 1 ), admin_url( 'admin.php' ) ) );
			exit;
		}

		// Upload an admin document into the library.
		if ( isset( $_POST['awivest_admin_action'] ) && 'upload_document' === $_POST['awivest_admin_action'] ) {
			check_admin_referer( 'awivest_doc' );
			$title           = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';
			$type            = isset( $_POST['document_type'] ) ? sanitize_text_field( wp_unslash( $_POST['document_type'] ) ) : 'general';
			$visibility      = isset( $_POST['visibility'] ) ? sanitize_key( $_POST['visibility'] ) : 'all';
			$target_investor = isset( $_POST['investor_id'] ) ? sanitize_text_field( wp_unslash( $_POST['investor_id'] ) ) : '';
			if ( ! empty( $_POST['is_onboarding'] ) ) {
				$type       = 'onboarding_agreement';
				$visibility = 'all';
			}

			if ( ! empty( $_FILES['doc_file']['name'] ) ) {
				$stored = AWIVEST_KYC::instance()->store_file( $_FILES['doc_file'] );
				if ( ! is_wp_error( $stored ) ) {
					global $wpdb;
					$wpdb->insert(
						AWIVEST_DB::documents(),
						array(
							'investor_id'   => 'private' === $visibility ? $target_investor : '',
							'title'         => $title,
							'file_path'     => $stored['relative'],
							'document_type' => $type,
							'visibility'    => $visibility,
							'uploaded_by'   => get_current_user_id(),
							'created_at'    => current_time( 'mysql' ),
						)
					);
				}
			}
			wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-documents', 'updated' => 1 ), admin_url( 'admin.php' ) ) );
			exit;
		}

		// CSV export of all members (personal details, KYC docs, status, signing).
		if ( isset( $_REQUEST['awivest_export'] ) && 'members' === $_REQUEST['awivest_export'] ) {
			$this->export_members_csv();
		}

		// Edit an admin document (metadata + optional file replace).
		if ( isset( $_POST['awivest_admin_action'] ) && 'edit_document' === $_POST['awivest_admin_action'] ) {
			check_admin_referer( 'awivest_doc_edit' );
			global $wpdb;
			$id  = isset( $_POST['doc_id'] ) ? absint( $_POST['doc_id'] ) : 0;
			$doc = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::documents() . ' WHERE id = %d', $id ) );
			if ( $doc ) {
				$fields = array(
					'title'         => isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : $doc->title,
					'document_type' => isset( $_POST['document_type'] ) ? sanitize_text_field( wp_unslash( $_POST['document_type'] ) ) : $doc->document_type,
					'visibility'    => isset( $_POST['visibility'] ) ? sanitize_key( $_POST['visibility'] ) : $doc->visibility,
				);
				if ( ! empty( $_FILES['doc_file']['name'] ) ) {
					$stored = AWIVEST_KYC::instance()->store_file( $_FILES['doc_file'] );
					if ( ! is_wp_error( $stored ) ) {
						$this->delete_doc_file( $doc->file_path );
						$fields['file_path'] = $stored['relative'];
					}
				}
				$wpdb->update( AWIVEST_DB::documents(), $fields, array( 'id' => $id ) );
				AWIVEST_DB::log( $doc->investor_id, 'document_edit', $fields['title'] );
			}
			wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-documents', 'updated' => 1 ), admin_url( 'admin.php' ) ) );
			exit;
		}

		// Delete an admin document.
		if ( isset( $_GET['awivest_doc_action'], $_GET['doc'] ) && 'delete' === $_GET['awivest_doc_action'] ) {
			$id = absint( $_GET['doc'] );
			check_admin_referer( 'awivest_doc_delete_' . $id );
			global $wpdb;
			$doc = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::documents() . ' WHERE id = %d', $id ) );
			if ( $doc ) {
				$this->delete_doc_file( $doc->file_path );
				$wpdb->delete( AWIVEST_DB::documents(), array( 'id' => $id ) );
				AWIVEST_DB::log( $doc->investor_id, 'document_delete', $doc->title );
			}
			wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-documents', 'updated' => 1 ), admin_url( 'admin.php' ) ) );
			exit;
		}

		// Approve / deactivate / reactivate an investor account.
		if ( isset( $_GET['awivest_status'], $_GET['investor'] ) ) {
			check_admin_referer( 'awivest_status' );
			$iid = sanitize_text_field( wp_unslash( $_GET['investor'] ) );
			$to  = sanitize_key( wp_unslash( $_GET['awivest_status'] ) );
			$inv = AWIVEST_DB::get_investor_by_investor_id( $iid );
			if ( $inv ) {
				$this->set_status( $inv, $to );
			}
			wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-investors', 'updated' => 1 ), admin_url( 'admin.php' ) ) );
			exit;
		}

		// Archive / restore / permanently delete an investor.
		if ( isset( $_GET['awivest_member_action'], $_GET['investor'] ) ) {
			$action = sanitize_key( wp_unslash( $_GET['awivest_member_action'] ) );
			$iid    = sanitize_text_field( wp_unslash( $_GET['investor'] ) );
			if ( in_array( $action, array( 'archive', 'restore', 'delete', 'return' ), true ) ) {
				check_admin_referer( 'awivest_' . $action . '_member_' . $iid );
				$inv    = AWIVEST_DB::get_investor_by_investor_id( $iid );
				$notice = $action . '_failed';
				if ( $inv ) {
					if ( 'delete' === $action ) {
						$result = $this->delete_investor( $inv );
						$notice = is_wp_error( $result ) ? rawurlencode( $result->get_error_message() ) : 'deleted';
					} elseif ( 'archive' === $action ) {
						$this->archive_investor( $inv );
						$notice = 'archived';
					} elseif ( 'return' === $action ) {
						$reason = isset( $_GET['reason'] ) ? sanitize_text_field( wp_unslash( $_GET['reason'] ) ) : '';
						$this->return_investor( $inv, $reason );
						$notice = 'returned_ok';
					} else {
						$this->restore_investor( $inv );
						$notice = 'restored';
					}
				}
				wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-investors', 'awivest_notice' => $notice ), admin_url( 'admin.php' ) ) );
				exit;
			}
		}
	}

	private function delete_doc_file( $relative ) {
		if ( ! $relative ) {
			return;
		}
		$base      = AWIVEST_Activator::upload_basedir();
		$real_base = realpath( $base );
		$path      = realpath( trailingslashit( $base ) . ltrim( $relative, '/' ) );
		if ( $path && $real_base && strpos( $path, $real_base ) === 0 && is_file( $path ) ) {
			@unlink( $path );
		}
	}

	/**
	 * Permanently delete an investor: their submissions and portal data, the
	 * files they uploaded, and the linked WordPress user account. Guards against
	 * deleting administrators or the current user. Returns true or WP_Error.
	 *
	 * @param object $investor Investor row.
	 * @return true|WP_Error
	 */
	private function delete_investor( $investor ) {
		global $wpdb;

		$wp_user = $investor->wp_user_id ? get_user_by( 'id', $investor->wp_user_id ) : null;

		// Safety: never delete your own account or an administrator from here.
		if ( $wp_user ) {
			if ( (int) $wp_user->ID === get_current_user_id() ) {
				return new WP_Error( 'self', 'You cannot delete your own account from here.' );
			}
			if ( user_can( $wp_user, 'manage_options' ) ) {
				return new WP_Error( 'admin', 'That account belongs to an administrator and was not deleted.' );
			}
		}

		$iid = $investor->investor_id;

		// Remove files this member uploaded: KYC docs, private documents, form signatures, welfare claim files.
		$files = array();
		$files = array_merge( $files, (array) $wpdb->get_col( $wpdb->prepare( 'SELECT file_path FROM ' . AWIVEST_DB::kyc() . ' WHERE investor_id = %s', $iid ) ) );
		$files = array_merge( $files, (array) $wpdb->get_col( $wpdb->prepare( 'SELECT file_path FROM ' . AWIVEST_DB::documents() . ' WHERE investor_id = %s', $iid ) ) );
		$files = array_merge( $files, (array) $wpdb->get_col( $wpdb->prepare( 'SELECT signature_path FROM ' . AWIVEST_DB::forms() . ' WHERE investor_id = %s', $iid ) ) );
		$files = array_merge( $files, (array) $wpdb->get_col( $wpdb->prepare( 'SELECT file_path FROM ' . AWIVEST_DB::welfare_claims() . ' WHERE investor_id = %s', $iid ) ) );
		foreach ( $files as $rel ) {
			$this->delete_doc_file( $rel );
		}

		// Remove this member's rows from every per-investor table (submissions included).
		$tables = array(
			AWIVEST_DB::kyc(),
			AWIVEST_DB::documents(),
			AWIVEST_DB::consents(),
			AWIVEST_DB::agreements(),
			AWIVEST_DB::forms(),
			AWIVEST_DB::welfare(),
			AWIVEST_DB::welfare_claims(),
			AWIVEST_DB::mpesa(),
			AWIVEST_DB::dividends(),
			AWIVEST_DB::interests(),
		);
		foreach ( $tables as $t ) {
			$wpdb->delete( $t, array( 'investor_id' => $iid ) );
		}

		// Remove the investor record itself.
		$wpdb->delete( AWIVEST_DB::investors(), array( 'investor_id' => $iid ) );

		AWIVEST_DB::log( $iid, 'investor_deleted', $wp_user ? $wp_user->user_email : '' );

		// Finally delete the linked WordPress user account.
		if ( $wp_user ) {
			require_once ABSPATH . 'wp-admin/includes/user.php';
			wp_delete_user( $wp_user->ID );
		}

		return true;
	}

	/**
	 * Soft delete: archive an investor. Hides them from the active list and
	 * blocks portal access, but keeps every record so they can be restored.
	 *
	 * @param object $investor Investor row.
	 */
	private function archive_investor( $investor ) {
		global $wpdb;
		$prev = in_array( $investor->status, array( 'pending', 'active', 'deactivated' ), true ) ? $investor->status : 'pending';
		$wpdb->update( AWIVEST_DB::investors(), array( 'status' => 'archived', 'prev_status' => $prev ), array( 'investor_id' => $investor->investor_id ) );
		AWIVEST_DB::log( $investor->investor_id, 'investor_archived', $prev );
	}

	/**
	 * Restore an archived investor to the status they had before archiving
	 * (falls back to "pending" if that is unknown).
	 *
	 * @param object $investor Investor row.
	 */
	private function restore_investor( $investor ) {
		global $wpdb;
		$prev = isset( $investor->prev_status ) ? $investor->prev_status : '';
		if ( ! in_array( $prev, array( 'pending', 'active', 'deactivated' ), true ) ) {
			$prev = 'pending';
		}
		$wpdb->update( AWIVEST_DB::investors(), array( 'status' => $prev, 'prev_status' => '' ), array( 'investor_id' => $investor->investor_id ) );
		AWIVEST_DB::log( $investor->investor_id, 'investor_restored', $prev );
	}

	/**
	 * Committee "Return for corrections": mark the member's onboarding pack as
	 * returned with a note and email them to fix and resubmit. The account stays
	 * pending; the note reopens the wizard for the member.
	 *
	 * @param object $investor Investor row.
	 * @param string $reason   Committee note shown to the member.
	 */
	private function return_investor( $investor, $reason ) {
		global $wpdb;
		$wpdb->update( AWIVEST_DB::investors(), array( 'onboarding_stage' => 'returned', 'returned_reason' => $reason ), array( 'investor_id' => $investor->investor_id ) );
		AWIVEST_DB::log( $investor->investor_id, 'onboarding_returned', $reason );
		$user = $investor->wp_user_id ? get_user_by( 'id', $investor->wp_user_id ) : null;
		if ( $user ) {
			$lines = array( 'Your AWIVEST membership pack has been returned for corrections.' );
			if ( '' !== (string) $reason ) {
				$lines[] = '<strong>What to fix:</strong> ' . esc_html( $reason );
			}
			$lines[] = 'Please log in to the portal, update your details, and submit again.';
			AWIVEST_Notifications::send( $user->user_email, 'Membership returned for corrections', $lines );
		}
	}

	/**
	 * Compact onboarding checklist shown in the Investors table for members still
	 * going through the sign-up wizard (status = pending). Returns escaped HTML.
	 *
	 * @param object $r Investor row.
	 * @return string
	 */
	private function onboarding_summary_cell( $r ) {
		if ( 'pending' !== $r->status || ! class_exists( 'AWIVEST_Onboarding' ) ) {
			return '';
		}
		$stage = isset( $r->onboarding_stage ) ? $r->onboarding_stage : '';
		$req   = array_keys( AWIVEST_Onboarding::required_docs() );
		$have  = count( array_intersect( $req, AWIVEST_Onboarding::uploaded_doc_types( $r->investor_id ) ) );
		$det   = AWIVEST_Onboarding::details_complete( $r ) ? 'yes' : 'no';
		$sign  = AWIVEST_Onboarding::sign_complete( $r ) ? 'yes' : 'no';
		$out   = '<br><small>Stage: ' . esc_html( '' !== $stage ? $stage : 'in progress' );
		$out  .= '<br>Details: ' . esc_html( $det ) . ' | Docs: ' . (int) $have . '/' . count( $req ) . ' | Signed: ' . esc_html( $sign ) . '</small>';
		$reason = isset( $r->returned_reason ) ? $r->returned_reason : '';
		if ( 'returned' === $stage && '' !== (string) $reason ) {
			$out .= '<br><small style="color:#b32d2e">Returned: ' . esc_html( $reason ) . '</small>';
		}
		return $out;
	}

	public function page_dashboard() {
		global $wpdb;
		$investors = (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . AWIVEST_DB::investors() );
		$active    = (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . AWIVEST_DB::investors() . " WHERE status = 'active'" );
		$pending   = (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . AWIVEST_DB::investors() . " WHERE status = 'pending'" );
		$kyc_pend  = (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . AWIVEST_DB::kyc() . " WHERE status = 'pending'" );

		echo '<div class="wrap"><h1>AWIVEST Investor Portal</h1>';
		echo '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:16px">';
		$this->stat_box( 'Total Investors', $investors );
		$this->stat_box( 'Active Members', $active );
		$this->stat_box( 'Pending Approval', $pending );
		$this->stat_box( 'KYC Awaiting Review', $kyc_pend );
		echo '</div>';
		echo '<p style="margin-top:20px">Front-end portal page: <a href="' . esc_url( AWIVEST_Auth::instance()->portal_url() ) . '">' . esc_html( AWIVEST_Auth::instance()->portal_url() ) . '</a></p>';
		echo '<p>Approve members under <strong>Investors</strong>. Build portal forms under <strong>Online Forms</strong>. See analytics under <strong>Reports</strong>.</p>';
		echo '</div>';
	}

	private function stat_box( $label, $value ) {
		echo '<div style="background:#fff;border:1px solid #ccd0d4;padding:18px 22px;min-width:160px;border-radius:6px">';
		echo '<div style="font-size:13px;color:#666">' . esc_html( $label ) . '</div>';
		echo '<div style="font-size:30px;font-weight:700">' . esc_html( $value ) . '</div></div>';
	}

	private function status_link( $investor_id, $to, $label, $primary = false ) {
		$url = wp_nonce_url( add_query_arg( array( 'page' => 'awivest-investors', 'awivest_status' => $to, 'investor' => $investor_id ), admin_url( 'admin.php' ) ), 'awivest_status' );
		$cls = $primary ? 'button button-primary' : 'button';
		return '<a class="' . esc_attr( $cls ) . '" href="' . esc_url( $url ) . '">' . esc_html( $label ) . '</a>';
	}

	private function member_action_link( $investor_id, $action, $label, $primary = false ) {
		$url = wp_nonce_url(
			add_query_arg(
				array(
					'page'                  => 'awivest-investors',
					'awivest_member_action' => $action,
					'investor'              => $investor_id,
				),
				admin_url( 'admin.php' )
			),
			'awivest_' . $action . '_member_' . $investor_id
		);
		$cls = $primary ? 'button button-primary' : 'button';
		return '<a class="' . esc_attr( $cls ) . '" href="' . esc_url( $url ) . '">' . esc_html( $label ) . '</a>';
	}

	private function export_members_csv() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'You do not have permission to export member data.' );
		}
		$nonce = isset( $_REQUEST['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['_wpnonce'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, 'awivest_export_members' ) ) {
			wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-investors', 'awivest_notice' => 'export_expired' ), admin_url( 'admin.php' ) ) );
			exit;
		}
		global $wpdb;
		$rows = $wpdb->get_results( 'SELECT * FROM ' . AWIVEST_DB::investors() . ' ORDER BY created_at DESC' );

		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=awivest-members-' . gmdate( 'Y-m-d' ) . '.csv' );
		$out = fopen( 'php://output', 'w' );
		fputcsv(
			$out,
			array(
				'Investor ID', 'Full name', 'Email', 'Phone', 'ID/Passport No', 'KRA PIN', 'Date of birth',
				'Postal address', 'Physical address',
				'Next of kin', 'NOK relationship', 'NOK phone', 'NOK ID',
				'Beneficiary', 'Beneficiary relationship', 'Beneficiary phone', 'Beneficiary ID',
				'Nominee', 'Nominee relationship', 'Nominee phone', 'Nominee ID',
				'Status', 'Onboarding stage', 'KYC status',
				'Passport photo', 'ID copy', 'KRA certificate', 'Agreement signed',
				'Returned reason', 'Registered',
			)
		);
		foreach ( $rows as $r ) {
			$user  = $r->wp_user_id ? get_user_by( 'id', $r->wp_user_id ) : null;
			$email = $user ? $user->user_email : '';
			$have  = class_exists( 'AWIVEST_Onboarding' ) ? AWIVEST_Onboarding::uploaded_doc_types( $r->investor_id ) : array();
			$g     = function ( $k ) use ( $r ) {
				return isset( $r->$k ) ? (string) $r->$k : '';
			};
			$has   = function ( $k ) use ( $have ) {
				return in_array( $k, $have, true ) ? 'yes' : 'no';
			};
			$signed = 'no';
			if ( class_exists( 'AWIVEST_Consents' ) ) {
				$packet = AWIVEST_Consents::packet_row( $r );
				$signed = ( $packet && 'agreed' === $packet->status ) ? 'yes' : 'no';
			}
			fputcsv(
				$out,
				array(
					$r->investor_id, $g( 'full_name' ), $email, $g( 'phone' ), $g( 'id_number' ), $g( 'kra_pin' ), substr( $g( 'dob' ), 0, 10 ),
					$g( 'postal_address' ), $g( 'physical_address' ),
					$g( 'nok_name' ), $g( 'nok_relationship' ), $g( 'nok_phone' ), $g( 'nok_id' ),
					$g( 'beneficiary_name' ), $g( 'beneficiary_relationship' ), $g( 'beneficiary_phone' ), $g( 'beneficiary_id' ),
					$g( 'nominee_name' ), $g( 'nominee_relationship' ), $g( 'nominee_phone' ), $g( 'nominee_id' ),
					$g( 'status' ), $g( 'onboarding_stage' ), $g( 'kyc_status' ),
					$has( 'passport_photo' ), $has( 'id_copy' ), $has( 'kra_certificate' ), $signed,
					$g( 'returned_reason' ), $g( 'created_at' ),
				)
			);
		}
		fclose( $out );
		exit;
	}

	public function page_investors() {
		global $wpdb;

		// A specific member requested (?investor=ID): show the per-member detail view.
		// Rendered under this already-registered page so WordPress authorizes access.
		if ( isset( $_GET['investor'] ) && '' !== sanitize_text_field( wp_unslash( $_GET['investor'] ) ) ) {
			$this->page_member();
			return;
		}

		$show_archived = isset( $_GET['show'] ) && 'archived' === sanitize_key( wp_unslash( $_GET['show'] ) );
		$t             = AWIVEST_DB::investors();
		if ( $show_archived ) {
			$rows = $wpdb->get_results( "SELECT * FROM {$t} WHERE status = 'archived' ORDER BY created_at DESC" );
		} else {
			$rows = $wpdb->get_results( "SELECT * FROM {$t} WHERE status != 'archived' ORDER BY created_at DESC" );
		}
		$active_count   = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$t} WHERE status != 'archived'" );
		$archived_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$t} WHERE status = 'archived'" );
		$pandadoc_ok    = AWIVEST_PandaDoc::is_configured();

		echo '<div class="wrap"><h1>Investors</h1>';
		if ( isset( $_GET['awivest_notice'] ) ) {
			$n   = sanitize_text_field( wp_unslash( $_GET['awivest_notice'] ) );
			$ok  = in_array( $n, array( 'deleted', 'archived', 'restored', 'returned_ok' ), true );
			$map = array(
				'deleted'        => 'Member deleted, along with their submissions and data.',
				'archived'       => 'Member archived. They are hidden from the active list and cannot access the portal, but their data is kept and can be restored.',
				'restored'       => 'Member restored to the active list.',
				'returned_ok'    => 'Sign-up sent back to the member for corrections.',
				'delete_failed'  => 'Could not delete that member.',
				'archive_failed' => 'Could not archive that member.',
				'restore_failed' => 'Could not restore that member.',
				'return_failed'  => 'Could not return that member.',
				'export_expired' => 'Your export link expired for security. Please click "Export members to CSV" again.',
			);
			$msg = isset( $map[ $n ] ) ? $map[ $n ] : rawurldecode( $n );
			echo '<div class="notice ' . ( $ok ? 'notice-success' : 'notice-error' ) . ' is-dismissible"><p>' . esc_html( $msg ) . '</p></div>';
		}
		echo '<p class="description">New members are <strong>Pending</strong> until you Approve them. Approving (or approving their KYC) activates the account, unlocks all portal tabs, and emails the member.</p>';
		echo '<div style="margin:12px 0"><form method="post" action="' . esc_url( admin_url( 'admin.php?page=awivest-investors' ) ) . '" style="display:inline-block">';
		wp_nonce_field( 'awivest_export_members' );
		echo '<input type="hidden" name="awivest_export" value="members">';
		echo '<button type="submit" class="button button-secondary">Export members to CSV</button>';
		echo '</form> <span class="description">Downloads every member record: personal details, next of kin, beneficiary, nominee, status, documents and signing.</span></div>';
		$base_url = admin_url( 'admin.php?page=awivest-investors' );
		echo '<p>';
		if ( $show_archived ) {
			echo '<a href="' . esc_url( $base_url ) . '">&larr; Back to active members (' . (int) $active_count . ')</a> &nbsp;|&nbsp; <strong>Archived (' . (int) $archived_count . ')</strong>';
		} else {
			echo '<strong>Active members (' . (int) $active_count . ')</strong> &nbsp;|&nbsp; <a href="' . esc_url( add_query_arg( 'show', 'archived', $base_url ) ) . '">View archived (' . (int) $archived_count . ')</a>';
		}
		echo '</p>';
		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><th>Investor ID</th><th>Name</th><th>Status</th><th>KYC</th><th>Joined</th><th>Actions</th></tr></thead><tbody>';
		if ( $rows ) {
			foreach ( $rows as $r ) {
				echo '<tr><td>' . esc_html( $r->investor_id ) . '</td><td>' . esc_html( $r->full_name ) . '</td><td>' . esc_html( $r->status ) . $this->onboarding_summary_cell( $r ) . '</td><td>' . esc_html( $r->kyc_status ) . '</td><td>' . esc_html( mysql2date( 'M j, Y', $r->created_at ) ) . '</td><td>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				$view_url = add_query_arg( array( 'page' => 'awivest-investors', 'investor' => rawurlencode( $r->investor_id ) ), admin_url( 'admin.php' ) );
				echo '<a class="button" href="' . esc_url( $view_url ) . '">View details</a> ';
				echo '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
				if ( 'archived' === $r->status ) {
					echo $this->member_action_link( $r->investor_id, 'restore', 'Restore', true );
				} else {
					if ( 'active' === $r->status ) {
						echo $this->status_link( $r->investor_id, 'deactivated', 'Deactivate' );
					} elseif ( 'deactivated' === $r->status ) {
						echo $this->status_link( $r->investor_id, 'active', 'Reactivate', true );
					} else {
						echo $this->status_link( $r->investor_id, 'active', 'Approve', true );
						if ( isset( $r->onboarding_stage ) && 'submitted' === $r->onboarding_stage ) {
							$ret_url = wp_nonce_url( add_query_arg( array( 'page' => 'awivest-investors', 'awivest_member_action' => 'return', 'investor' => $r->investor_id ), admin_url( 'admin.php' ) ), 'awivest_return_member_' . $r->investor_id );
							echo '<a class="button" href="' . esc_url( $ret_url ) . '" onclick="var r=prompt(\'Reason to return this sign-up for corrections (the member will see this):\');if(r===null)return false;window.location.href=this.href+\'&reason=\'+encodeURIComponent(r);return false;">Return for corrections</a>';
						}
						echo $this->status_link( $r->investor_id, 'deactivated', 'Reject' );
					}
					if ( $pandadoc_ok ) {
						echo '<form method="post" style="display:flex;gap:4px;flex-wrap:wrap">';
						wp_nonce_field( 'awivest_pandadoc_send' );
						echo '<input type="hidden" name="awivest_admin_action" value="pandadoc_send">';
						echo '<input type="hidden" name="investor_id" value="' . esc_attr( $r->investor_id ) . '">';
						echo '<input type="text" name="agreement_title" value="Partnership Agreement" style="width:140px">';
						echo '<button class="button">Send for signing</button>';
						echo '</form>';
					}
					echo $this->member_action_link( $r->investor_id, 'archive', 'Archive' );
				}
				$del_label = 'archived' === $r->status ? 'Delete permanently' : 'Delete';
				$del_url   = wp_nonce_url( add_query_arg( array( 'page' => 'awivest-investors', 'awivest_member_action' => 'delete', 'investor' => $r->investor_id ), admin_url( 'admin.php' ) ), 'awivest_delete_member_' . $r->investor_id );
				echo '<a class="button button-link-delete" style="color:#b32d2e" href="' . esc_url( $del_url ) . '" onclick="return confirm(\'Permanently delete ' . esc_attr( $r->investor_id ) . ' and ALL of their submissions and data? This cannot be undone.\');">' . esc_html( $del_label ) . '</a>';
				echo '</div></td></tr>';
			}
		} else {
			echo '<tr><td colspan="6">' . esc_html( $show_archived ? 'No archived members.' : 'No investors yet.' ) . '</td></tr>';
		}
		echo '</tbody></table></div>';
	}

	private function status_badge( $status ) {
		$status = (string) $status;
		$color  = 'pending' === $status ? '#b26a00' : ( 'approved' === $status ? '#1a7f37' : ( 'rejected' === $status ? '#b32d2e' : '#555' ) );
		return '<span style="color:' . esc_attr( $color ) . ';font-weight:600">' . esc_html( ucfirst( $status ) ) . '</span>';
	}

	public function page_submissions() {
		global $wpdb;
		$kyc   = AWIVEST_DB::kyc();
		$inv_t = AWIVEST_DB::investors();
		$rows  = $wpdb->get_results(
			"SELECT k.investor_id AS investor_id,
			        MAX(i.full_name) AS full_name,
			        COUNT(k.id) AS total,
			        SUM( CASE WHEN k.status = 'pending' THEN 1 ELSE 0 END ) AS pending,
			        SUM( CASE WHEN k.status = 'approved' THEN 1 ELSE 0 END ) AS approved,
			        SUM( CASE WHEN k.status = 'rejected' THEN 1 ELSE 0 END ) AS rejected,
			        MAX(k.created_at) AS last_at
			 FROM {$kyc} k
			 LEFT JOIN {$inv_t} i ON i.investor_id = k.investor_id
			 GROUP BY k.investor_id
			 ORDER BY pending DESC, last_at DESC"
		);

		echo '<div class="wrap"><h1>Submissions</h1>';
		echo '<p class="description">One row per member - each member\'s uploaded documents are grouped together. Click <strong>Review</strong> to see the files and personal details and to approve or reject each document. Approving a member\'s KYC also activates their account.</p>';
		if ( isset( $_GET['updated'] ) ) {
			echo '<div class="notice notice-success is-dismissible"><p>Submission updated.</p></div>';
		}

		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><th>Investor ID</th><th>Name</th><th>Documents (type - status)</th><th>Overall</th><th>Last upload</th><th>Action</th></tr></thead><tbody>';
		if ( $rows ) {
			foreach ( $rows as $r ) {
				$docs  = $wpdb->get_results( $wpdb->prepare( "SELECT document_type, status FROM {$kyc} WHERE investor_id = %s ORDER BY created_at ASC", $r->investor_id ) );
				$parts = array();
				foreach ( $docs as $d ) {
					$parts[] = esc_html( $d->document_type ) . ' - ' . $this->status_badge( $d->status );
				}
				$summary = $parts ? implode( '<br>', $parts ) : '<em>No files</em>';

				if ( (int) $r->pending > 0 ) {
					$overall = '<strong style="color:#b26a00">' . (int) $r->pending . ' pending review</strong>';
				} elseif ( (int) $r->rejected > 0 && 0 === (int) $r->approved ) {
					$overall = '<span style="color:#b32d2e">Rejected</span>';
				} else {
					$overall = '<span style="color:#1a7f37">All reviewed</span>';
				}

				$review_url = add_query_arg( array( 'page' => 'awivest-investors', 'investor' => rawurlencode( $r->investor_id ) ), admin_url( 'admin.php' ) );
				echo '<tr>';
				echo '<td>' . esc_html( $r->investor_id ) . '</td>';
				echo '<td>' . esc_html( $r->full_name ? $r->full_name : '-' ) . '</td>';
				echo '<td>' . $summary . '</td>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				echo '<td>' . $overall . '</td>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				echo '<td>' . esc_html( $r->last_at ? mysql2date( 'M j, Y', $r->last_at ) : '-' ) . '</td>';
				echo '<td><a class="button button-primary" href="' . esc_url( $review_url ) . '">Review</a></td>';
				echo '</tr>';
			}
		} else {
			echo '<tr><td colspan="6">No submissions yet.</td></tr>';
		}
		echo '</tbody></table></div>';
	}

	public function page_documents() {
		global $wpdb;
		$investors = $wpdb->get_results( 'SELECT investor_id, full_name FROM ' . AWIVEST_DB::investors() . ' ORDER BY full_name' );

		echo '<div class="wrap"><h1>Documents</h1>';
		if ( isset( $_GET['edit'] ) ) {
			$eid  = absint( $_GET['edit'] );
			$edoc = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::documents() . ' WHERE id = %d', $eid ) );
			if ( $edoc ) {
				echo '<h2>Edit Document</h2>';
				echo '<form method="post" enctype="multipart/form-data">';
				wp_nonce_field( 'awivest_doc_edit' );
				echo '<input type="hidden" name="awivest_admin_action" value="edit_document">';
				echo '<input type="hidden" name="doc_id" value="' . esc_attr( $edoc->id ) . '">';
				echo '<table class="form-table">';
				echo '<tr><th>Title</th><td><input type="text" name="title" class="regular-text" value="' . esc_attr( $edoc->title ) . '" required></td></tr>';
				echo '<tr><th>Type</th><td><input type="text" name="document_type" class="regular-text" value="' . esc_attr( $edoc->document_type ) . '" list="awivest-doc-types-edit"><datalist id="awivest-doc-types-edit"><option value="general"><option value="statement"><option value="report"><option value="agreement"><option value="welfare_statement"><option value="onboarding_agreement"></datalist></td></tr>';
				echo '<tr><th>Visibility</th><td><select name="visibility"><option value="all"' . selected( $edoc->visibility, 'all', false ) . '>All investors</option><option value="private"' . selected( $edoc->visibility, 'private', false ) . '>Specific investor</option></select></td></tr>';
				echo '<tr><th>Replace file (optional)</th><td><input type="file" name="doc_file" accept=".pdf,.jpg,.jpeg,.png,.docx"><p class="description">Leave empty to keep the current file.</p></td></tr>';
				echo '</table><p><button class="button button-primary">Save Changes</button> <a class="button" href="' . esc_url( admin_url( 'admin.php?page=awivest-documents' ) ) . '">Cancel</a></p></form><hr>';
			}
		}
		echo '<h2>Upload Document</h2>';
		echo '<form method="post" enctype="multipart/form-data">';
		wp_nonce_field( 'awivest_doc' );
		echo '<input type="hidden" name="awivest_admin_action" value="upload_document">';
		echo '<table class="form-table">';
		echo '<tr><th>Title</th><td><input type="text" name="title" class="regular-text" required></td></tr>';
		echo '<tr><th>Type</th><td><input type="text" name="document_type" class="regular-text" value="general" list="awivest-doc-types"><datalist id="awivest-doc-types"><option value="general"><option value="statement"><option value="report"><option value="agreement"><option value="welfare_statement"></datalist><p class="description">Use "statement" or "report" to show under the investor\'s Statements tab; "welfare_statement" to show under their Welfare tab.</p></td></tr>';
		echo '<tr><th>Onboarding agreement</th><td><label><input type="checkbox" name="is_onboarding" value="1"> Require members to read &amp; accept this when their account is approved (forces type to onboarding agreement, visible to all).</label></td></tr>';
		echo '<tr><th>Visibility</th><td><select name="visibility"><option value="all">All investors</option><option value="private">Specific investor</option></select></td></tr>';
		echo '<tr><th>Investor (if private)</th><td><select name="investor_id"><option value="">--</option>';
		foreach ( $investors as $i ) {
			echo '<option value="' . esc_attr( $i->investor_id ) . '">' . esc_html( $i->investor_id . ' - ' . $i->full_name ) . '</option>';
		}
		echo '</select></td></tr>';
		echo '<tr><th>File</th><td><input type="file" name="doc_file" accept=".pdf,.jpg,.jpeg,.png,.docx" required></td></tr>';
		echo '</table><p><button class="button button-primary">Upload</button></p></form>';

		$docs = $wpdb->get_results( 'SELECT * FROM ' . AWIVEST_DB::documents() . ' ORDER BY created_at DESC' );
		echo '<h2>Library</h2>';
		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><th>Title</th><th>Type</th><th>Visibility</th><th>Investor</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
		if ( $docs ) {
			foreach ( $docs as $d ) {
				echo '<tr><td>' . esc_html( $d->title ) . '</td><td>' . esc_html( $d->document_type ) . '</td><td>' . esc_html( $d->visibility ) . '</td><td>' . esc_html( $d->investor_id ) . '</td><td>' . esc_html( mysql2date( 'M j, Y', $d->created_at ) ) . '</td><td><a class="button" href="' . esc_url( add_query_arg( array( 'page' => 'awivest-documents', 'edit' => (int) $d->id ), admin_url( 'admin.php' ) ) ) . '">Edit</a> <a class="button" href="' . esc_url( wp_nonce_url( add_query_arg( array( 'page' => 'awivest-documents', 'awivest_doc_action' => 'delete', 'doc' => (int) $d->id ), admin_url( 'admin.php' ) ), 'awivest_doc_delete_' . $d->id ) ) . '" onclick="return confirm( &quot;Delete this document?&quot; );">Delete</a></td></tr>';
			}
		} else {
			echo '<tr><td colspan="6">No documents uploaded yet.</td></tr>';
		}
		echo '</tbody></table></div>';
	}

	public function page_member() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Access denied.' );
		}
		global $wpdb;
		$investor_id = isset( $_GET['investor'] ) ? sanitize_text_field( wp_unslash( $_GET['investor'] ) ) : '';
		$inv         = $investor_id ? AWIVEST_DB::get_investor_by_investor_id( $investor_id ) : null;

		echo '<div class="wrap"><h1>Member details</h1>';
		echo '<p><a href="' . esc_url( admin_url( 'admin.php?page=awivest-submissions' ) ) . '">&larr; Submissions</a> &nbsp;|&nbsp; <a href="' . esc_url( admin_url( 'admin.php?page=awivest-investors' ) ) . '">All investors</a></p>';

		if ( ! $inv ) {
			echo '<div class="notice notice-error"><p>Member not found.</p></div></div>';
			return;
		}
		if ( isset( $_GET['updated'] ) ) {
			echo '<div class="notice notice-success is-dismissible"><p>Submission updated.</p></div>';
		}

		$user  = $inv->wp_user_id ? get_user_by( 'id', $inv->wp_user_id ) : null;
		$email = $user ? $user->user_email : '';

		$raw  = function ( $k ) use ( $inv ) {
			return isset( $inv->$k ) ? trim( (string) $inv->$k ) : '';
		};
		$dash = function ( $v ) {
			return '' === (string) $v ? '-' : $v;
		};
		$dob = substr( $raw( 'dob' ), 0, 10 );
		if ( '0000-00-00' === $dob ) {
			$dob = '';
		}
		$nok = trim( $raw( 'nok_name' ) . ( $raw( 'nok_relationship' ) ? ' (' . $raw( 'nok_relationship' ) . ')' : '' ) );
		$ben = trim( $raw( 'beneficiary_name' ) . ( $raw( 'beneficiary_relationship' ) ? ' (' . $raw( 'beneficiary_relationship' ) . ')' : '' ) );
		$nom = trim( $raw( 'nominee_name' ) . ( $raw( 'nominee_relationship' ) ? ' (' . $raw( 'nominee_relationship' ) . ')' : '' ) );

		$details = array(
			'Email'             => $email,
			'Phone'             => $raw( 'phone' ),
			'ID / Passport No'  => $raw( 'id_number' ),
			'KRA PIN'           => $raw( 'kra_pin' ),
			'Date of birth'     => $dob,
			'Postal address'    => $raw( 'postal_address' ),
			'Physical address'  => $raw( 'physical_address' ),
			'Next of kin'       => $nok,
			'Next of kin phone' => $raw( 'nok_phone' ),
			'Beneficiary'       => $ben,
			'Beneficiary phone' => $raw( 'beneficiary_phone' ),
			'Nominee'           => $nom,
			'Nominee phone'     => $raw( 'nominee_phone' ),
			'Account status'    => $raw( 'status' ),
			'Onboarding stage'  => $raw( 'onboarding_stage' ),
			'KYC status'        => $raw( 'kyc_status' ),
			'Returned reason'   => $raw( 'returned_reason' ),
		);

		echo '<h2>' . esc_html( $inv->full_name ) . ' <span style="font-weight:400;color:#666">(' . esc_html( $inv->investor_id ) . ')</span></h2>';
		echo '<h3>Personal details</h3>';
		echo '<table class="form-table"><tbody>';
		foreach ( $details as $label => $val ) {
			echo '<tr><th style="width:220px">' . esc_html( $label ) . '</th><td>' . esc_html( $dash( $val ) ) . '</td></tr>';
		}
		echo '</tbody></table>';

		// Uploaded documents with per-document approve/reject.
		$docs = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::kyc() . ' WHERE investor_id = %s ORDER BY created_at DESC', $inv->investor_id ) );
		echo '<h3>Uploaded documents</h3>';
		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><th>Type</th><th>File</th><th>Status</th><th>Comment</th><th>Uploaded</th><th>Review</th></tr></thead><tbody>';
		if ( $docs ) {
			foreach ( $docs as $d ) {
				echo '<tr>';
				echo '<td>' . esc_html( $d->document_type ) . '</td>';
				echo '<td>' . esc_html( $d->original_name ? $d->original_name : 'file' ) . '<br><a class="button button-small" href="' . esc_url( AWIVEST_Documents::view_url( 'kyc', $d->id ) ) . '" target="_blank" rel="noopener">View</a> <a class="button button-small" href="' . esc_url( AWIVEST_Documents::download_url( 'kyc', $d->id ) ) . '">Download</a></td>';
				echo '<td>' . $this->status_badge( $d->status ) . '</td>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				echo '<td>' . esc_html( $d->admin_comment ) . '</td>';
				echo '<td>' . esc_html( mysql2date( 'M j, Y', $d->created_at ) ) . '</td>';
				echo '<td><form method="post" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
				wp_nonce_field( 'awivest_review' );
				echo '<input type="hidden" name="awivest_admin_action" value="review_submission">';
				echo '<input type="hidden" name="submission_id" value="' . (int) $d->id . '">';
				echo '<input type="hidden" name="back_investor" value="' . esc_attr( $inv->investor_id ) . '">';
				echo '<input type="text" name="comment" placeholder="Comment" value="' . esc_attr( $d->admin_comment ) . '">';
				echo '<button class="button button-primary" name="decision" value="approve">Approve</button>';
				echo '<button class="button" name="decision" value="reject">Reject</button>';
				echo '</form></td>';
				echo '</tr>';
			}
		} else {
			echo '<tr><td colspan="6">No documents uploaded yet.</td></tr>';
		}
		echo '</tbody></table>';

		// Onboarding agreement packet (from consents) + any ad-hoc agreements.
		echo '<h3>Onboarding agreement</h3>';
		$packet = AWIVEST_Consents::packet_row( $inv );
		if ( $packet ) {
			$pmap   = array( 'agreed' => 'Signed', 'sent' => 'Awaiting signature', 'viewed' => 'Awaiting signature', 'disagreed' => 'Declined' );
			$plabel = isset( $pmap[ $packet->status ] ) ? $pmap[ $packet->status ] : ucfirst( (string) $packet->status );
			echo '<p>Status: <strong>' . esc_html( $plabel ) . '</strong>';
			if ( ! empty( $packet->decided_at ) ) {
				echo ' &nbsp; (' . esc_html( mysql2date( 'M j, Y', $packet->decided_at ) ) . ')';
			}
			echo '</p>';
			if ( 'agreed' === $packet->status && ! empty( $packet->pandadoc_id ) ) {
				echo '<p><a class="button" href="' . esc_url( AWIVEST_PandaDoc::signed_view_url( $packet->pandadoc_id ) ) . '" target="_blank" rel="noopener">View signed copy</a> <a class="button" href="' . esc_url( AWIVEST_PandaDoc::signed_download_url( $packet->pandadoc_id ) ) . '">Download</a></p>';
			}
		} else {
			echo '<p>No onboarding agreement packet yet.</p>';
		}

		$ags = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::agreements() . ' WHERE investor_id = %s ORDER BY created_at DESC', $inv->investor_id ) );
		if ( $ags ) {
			echo '<h3>Other agreements</h3>';
			echo '<table class="wp-list-table widefat fixed striped" style="max-width:760px"><thead><tr><th>Title</th><th>Status</th><th>Signed</th><th></th></tr></thead><tbody>';
			foreach ( $ags as $a ) {
				echo '<tr><td>' . esc_html( $a->title ) . '</td><td>' . esc_html( ucfirst( $a->status ) ) . '</td><td>' . esc_html( $a->signed_at ? mysql2date( 'M j, Y', $a->signed_at ) : '-' ) . '</td><td>';
				if ( 'signed' === $a->status && $a->pandadoc_id ) {
					echo '<a class="button" href="' . esc_url( AWIVEST_PandaDoc::signed_view_url( $a->pandadoc_id ) ) . '" target="_blank" rel="noopener">View</a> <a class="button" href="' . esc_url( AWIVEST_PandaDoc::signed_download_url( $a->pandadoc_id ) ) . '">Download</a>';
				} else {
					echo '&mdash;';
				}
				echo '</td></tr>';
			}
			echo '</tbody></table>';
		}

		echo '</div>';
	}

	public function page_settings() {
		$callback = esc_url( rest_url( 'awivest/v1/mpesa-callback' ) );
		$webhook  = esc_url( rest_url( 'awivest/v1/pandadoc-webhook' ) );

		echo '<div class="wrap"><h1>AWIVEST Settings</h1><form method="post" action="options.php">';
		settings_fields( 'awivest_settings' );

		echo '<h2>General</h2><table class="form-table">';
		echo '<tr><th>Notification Admin Email</th><td><input type="email" name="awivest_admin_email" class="regular-text" value="' . esc_attr( get_option( 'awivest_admin_email', get_option( 'admin_email' ) ) ) . '"></td></tr>';
		echo '<tr><th>Sender Name (From)</th><td><input type="text" name="awivest_from_name" class="regular-text" value="' . esc_attr( get_option( 'awivest_from_name', 'AWIVEST' ) ) . '"><p class="description">Shown as the email sender name instead of "WordPress".</p></td></tr>';
		echo '<tr><th>Sender Email (From)</th><td><input type="email" name="awivest_from_email" class="regular-text" value="' . esc_attr( get_option( 'awivest_from_email', '' ) ) . '" placeholder="noreply@awivest.com"><p class="description">Use an address on your own domain for best delivery. Leave blank to auto-use noreply@your-domain.</p></td></tr>';
		$server_upload_mb = (int) floor( wp_max_upload_size() / ( 1024 * 1024 ) );
		echo '<tr><th>Max Upload Size (MB)</th><td><input type="number" name="awivest_max_upload_mb" min="1" max="1024" value="' . esc_attr( get_option( 'awivest_max_upload_mb', 10 ) ) . '"><p class="description">Maximum size for member uploads (KYC documents, signatures, welfare claim files). Your server currently allows about <strong>' . esc_html( $server_upload_mb ) . ' MB</strong> per upload, set by PHP <code>upload_max_filesize</code> and <code>post_max_size</code>. A value above your server limit will not take effect until your host raises those PHP limits.</p></td></tr>';
		echo '<tr><th>Dashboard Announcement</th><td><textarea name="awivest_announcement" rows="4" class="large-text">' . esc_textarea( get_option( 'awivest_announcement', '' ) ) . '</textarea></td></tr>';
		echo '</table>';

		echo '<h2>Human verification (anti-bot)</h2><table class="form-table">';
		$cap_provider = get_option( 'awivest_captcha_provider', 'none' );
		echo '<tr><th>CAPTCHA provider</th><td><select name="awivest_captcha_provider">';
		echo '<option value="none"' . selected( $cap_provider, 'none', false ) . '>None (honeypot + timing + rate-limit only)</option>';
		echo '<option value="turnstile"' . selected( $cap_provider, 'turnstile', false ) . '>Cloudflare Turnstile</option>';
		echo '<option value="recaptcha"' . selected( $cap_provider, 'recaptcha', false ) . '>Google reCAPTCHA v2</option>';
		echo '</select><p class="description">Sign-up is always protected by a hidden honeypot field, a timing check, and a per-connection rate limit (no setup needed). For an added visible human check, pick a provider and enter its keys below.</p></td></tr>';
		echo '<tr><th>Site Key</th><td><input type="text" name="awivest_captcha_site_key" class="regular-text" value="' . esc_attr( get_option( 'awivest_captcha_site_key', '' ) ) . '"></td></tr>';
		echo '<tr><th>Secret Key</th><td><input type="text" name="awivest_captcha_secret_key" class="regular-text" value="' . esc_attr( get_option( 'awivest_captcha_secret_key', '' ) ) . '"><p class="description">Create free keys in the Cloudflare Turnstile or Google reCAPTCHA dashboard. The check then appears on the member sign-up form.</p></td></tr>';
		echo '</table>';

		echo '<h2>PandaDoc (e-signing)</h2><table class="form-table">';
		echo '<tr><th>API Key</th><td><input type="text" name="awivest_pandadoc_api_key" class="regular-text" value="' . esc_attr( get_option( 'awivest_pandadoc_api_key', '' ) ) . '"></td></tr>';
		echo '<tr><th>Template ID</th><td><input type="text" name="awivest_pandadoc_template_id" class="regular-text" value="' . esc_attr( get_option( 'awivest_pandadoc_template_id', '' ) ) . '"><p class="description">Template used for one-off agreements sent to a single investor from the Investors page.</p></td></tr>';
		echo '<tr><th>Onboarding Packet Template ID</th><td><input type="text" name="awivest_pandadoc_onboarding_template" class="regular-text" value="' . esc_attr( get_option( 'awivest_pandadoc_onboarding_template', '' ) ) . '"><p class="description">Template for the single onboarding agreement packet every approved member e-signs once. Build it in PandaDoc with all agreement content and a signature field for the "Investor" role. When set, approved members must e-sign this before full portal access.</p></td></tr>';
		echo '<tr><th>Signer Role Name</th><td><input type="text" name="awivest_pandadoc_role" class="regular-text" value="' . esc_attr( get_option( 'awivest_pandadoc_role', 'Investor' ) ) . '" placeholder="Investor"><p class="description">Must match the signer role name used in your PandaDoc template(s), exactly (case-sensitive). Defaults to <code>Investor</code>. If "Prepare &amp; e-sign" fails with a role error, set this to the role shown in your template\'s Recipients/Roles.</p></td></tr>';
		echo '<tr><th>Webhook Shared Secret</th><td><input type="text" name="awivest_pandadoc_webhook_secret" class="regular-text" value="' . esc_attr( get_option( 'awivest_pandadoc_webhook_secret', '' ) ) . '"><p class="description">Webhook URL: <code>' . $webhook . '?secret=YOUR_SECRET</code></p></td></tr>';
		echo '</table>';

		echo '<h2>M-Pesa (Daraja)</h2><table class="form-table">';
		echo '<tr><th>Environment</th><td><select name="awivest_mpesa_env"><option value="sandbox"' . selected( get_option( 'awivest_mpesa_env', 'sandbox' ), 'sandbox', false ) . '>Sandbox</option><option value="production"' . selected( get_option( 'awivest_mpesa_env', 'sandbox' ), 'production', false ) . '>Production</option></select></td></tr>';
		echo '<tr><th>Consumer Key</th><td><input type="text" name="awivest_mpesa_consumer_key" class="regular-text" value="' . esc_attr( get_option( 'awivest_mpesa_consumer_key', '' ) ) . '"></td></tr>';
		echo '<tr><th>Consumer Secret</th><td><input type="text" name="awivest_mpesa_consumer_secret" class="regular-text" value="' . esc_attr( get_option( 'awivest_mpesa_consumer_secret', '' ) ) . '"></td></tr>';
		echo '<tr><th>Business Shortcode</th><td><input type="text" name="awivest_mpesa_shortcode" class="regular-text" value="' . esc_attr( get_option( 'awivest_mpesa_shortcode', '' ) ) . '"></td></tr>';
		echo '<tr><th>Passkey</th><td><input type="text" name="awivest_mpesa_passkey" class="regular-text" value="' . esc_attr( get_option( 'awivest_mpesa_passkey', '' ) ) . '"><p class="description">STK callback URL (set in Daraja): <code>' . $callback . '</code></p></td></tr>';
		echo '</table>';

		submit_button();
		echo '</form></div>';
	}
}
