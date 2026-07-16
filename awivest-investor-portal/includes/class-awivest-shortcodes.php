<?php
/**
 * Front-end portal: [awivest_portal] renders login/register when logged out,
 * and the member dashboard when logged in. Access to most tabs is gated until an
 * administrator approves the account (status = active).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Shortcodes {

	private static $instance = null;

	/** Views a pending (not-yet-approved) member may access. */
	private $open_views = array( 'dashboard', 'profile', 'kyc' );

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_shortcode( 'awivest_portal', array( $this, 'render_portal' ) );
	}

	private function messages() {
		$key = 'awivest_msg_' . AWIVEST_Auth::instance()->client_key();
		$msg = get_transient( $key );
		if ( ! $msg ) {
			return '';
		}
		delete_transient( $key );
		$class = 'success' === $msg['type'] ? 'awivest-alert success' : 'awivest-alert error';
		$out   = '<div class="' . esc_attr( $class ) . '"><ul>';
		foreach ( $msg['messages'] as $m ) {
			$out .= '<li>' . esc_html( $m ) . '</li>';
		}
		$out .= '</ul></div>';
		return $out;
	}

	private function investor() {
		return AWIVEST_DB::get_investor_by_user( get_current_user_id() );
	}

	private function is_active( $inv ) {
		return $inv && 'active' === $inv->status;
	}

	public function render_portal() {
		ob_start();
		echo '<div class="awivest-portal">';
		echo $this->messages(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		if ( ! is_user_logged_in() ) {
			$this->render_auth();
		} else {
			$inv = $this->investor();

			if ( $inv && in_array( $inv->status, array( 'archived', 'deactivated' ), true ) ) {
				// Inactive account: show a notice only, no portal.
				$this->render_inactive_notice( $inv );
			} elseif ( ! $inv || 'active' !== $inv->status ) {
				// New / pending members complete the combined sign-up wizard.
				AWIVEST_Onboarding::instance()->render( $inv );
			} else {
				$active = true;
				$view   = isset( $_GET['view'] ) ? sanitize_key( wp_unslash( $_GET['view'] ) ) : 'dashboard';

				// Legacy fallback: members approved before signing still sign here.
				if ( AWIVEST_Consents::has_pending( $inv ) ) {
					$view = 'review_agreements';
				}

				$this->render_nav( $view, $active );

				switch ( $view ) {
				case 'profile':
					$this->view_profile();
					break;
				case 'kyc':
					$this->view_kyc();
					break;
				case 'documents':
					$this->view_documents();
					break;
				case 'statements':
					$this->view_statements();
					break;
				case 'agreements':
					AWIVEST_PandaDoc::instance()->render_member_agreements( $this->investor() );
					break;
				case 'forms':
					AWIVEST_Forms::instance()->render_view();
					break;
				case 'opportunities':
					AWIVEST_Opportunities::instance()->render_view();
					break;
				case 'payments':
					AWIVEST_Mpesa::instance()->render_view();
					break;
				case 'dividends':
					AWIVEST_Dividends::instance()->render_view();
					break;
				case 'welfare':
					AWIVEST_Welfare::instance()->render_view();
					break;
				case 'tracking':
					$this->view_tracking();
					break;
				case 'msi':
					AWIVEST_MSI::instance()->render_view( $this->investor() );
					break;
				case 'tools':
					AWIVEST_MSI_Calc_Widgets::instance()->render_view( $this->investor() );
					break;
				case 'review_agreements':
					AWIVEST_Consents::instance()->render_review( $inv );
					break;
				default:
					$this->view_dashboard();
					break;
				}
			}
		}
		echo '</div>';
		return ob_get_clean();
	}

	private function render_auth() {
		$req     = isset( $_GET['awivest'] ) ? sanitize_key( wp_unslash( $_GET['awivest'] ) ) : 'login';

		// Email verification is a standalone step (shown without the login/register tabs).
		if ( 'verify' === $req ) {
			$this->render_verify_form();
			return;
		}

		$allowed = array( 'login', 'register', 'lostpassword', 'resetpass' );
		if ( ! in_array( $req, $allowed, true ) ) {
			$req = 'login';
		}
		?>
		<div class="awivest-auth awivest-card">
			<div class="awivest-tabs">
				<a class="<?php echo ( 'register' !== $req ) ? 'active' : ''; ?>" href="<?php echo esc_url( add_query_arg( 'awivest', 'login' ) ); ?>">Login</a>
				<a class="<?php echo ( 'register' === $req ) ? 'active' : ''; ?>" href="<?php echo esc_url( add_query_arg( 'awivest', 'register' ) ); ?>">Register</a>
			</div>
			<?php
			if ( 'register' === $req ) {
				$this->render_register_form();
			} elseif ( 'lostpassword' === $req ) {
				$this->render_lostpassword_form();
			} elseif ( 'resetpass' === $req ) {
				$this->render_resetpass_form();
			} else {
				$this->render_login_form();
			}
			?>
		</div>
		<?php
	}

	private function render_login_form() {
		?>
		<form method="post" class="awivest-form">
			<?php wp_nonce_field( 'awivest_login', 'awivest_nonce' ); ?>
			<input type="hidden" name="awivest_action" value="login">
			<label>Email or Investor ID<input type="text" name="identifier" required></label>
			<label>Password<input type="password" name="password" required></label>
			<label class="awivest-inline"><input type="checkbox" name="remember" value="1"> Remember me</label>
			<button type="submit" class="awivest-btn">Login</button>
			<p><a href="<?php echo esc_url( add_query_arg( 'awivest', 'lostpassword', AWIVEST_Auth::instance()->portal_url() ) ); ?>">Forgot password?</a></p>
		</form>
		<?php
	}

	private function render_register_form() {
		?>
		<form method="post" class="awivest-form">
			<?php wp_nonce_field( 'awivest_register', 'awivest_nonce' ); ?>
			<input type="hidden" name="awivest_action" value="register">
			<label>Full Name<input type="text" name="full_name" required></label>
			<label>Email Address<input type="email" name="email" required></label>
			<label>Phone<input type="text" name="phone"></label>
			<label>Password<input type="password" name="password" minlength="8" required></label>
			<?php AWIVEST_Security::render_challenge(); ?>
			<button type="submit" class="awivest-btn">Create Account</button>
		</form>
		<?php
	}

	private function render_verify_form() {
		$token = isset( $_GET['pending'] ) ? sanitize_text_field( wp_unslash( $_GET['pending'] ) ) : '';
		$portal = AWIVEST_Auth::instance()->portal_url();
		if ( '' === $token ) {
			echo '<div class="awivest-auth awivest-card"><h2>Verify your email</h2><p>This verification link is no longer valid. Please <a href="' . esc_url( add_query_arg( 'awivest', 'register', $portal ) ) . '">sign up again</a>.</p></div>';
			return;
		}
		?>
		<div class="awivest-auth awivest-card">
			<h2>Verify your email</h2>
			<p class="awivest-hint">We emailed you a 6-digit code. Enter it below to finish creating your account. If you do not see it, check your spam or junk folder.</p>
			<form method="post" class="awivest-form">
				<?php wp_nonce_field( 'awivest_verify_email', 'awivest_nonce' ); ?>
				<input type="hidden" name="awivest_action" value="verify_email">
				<input type="hidden" name="pending" value="<?php echo esc_attr( $token ); ?>">
				<label>Verification code<input type="text" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" required></label>
				<button type="submit" class="awivest-btn">Verify &amp; create account</button>
			</form>
			<form method="post" class="awivest-form" style="margin-top:8px">
				<?php wp_nonce_field( 'awivest_resend_code', 'awivest_nonce' ); ?>
				<input type="hidden" name="awivest_action" value="resend_code">
				<input type="hidden" name="pending" value="<?php echo esc_attr( $token ); ?>">
				<button type="submit" class="awivest-btn small">Resend code</button>
			</form>
			<p style="margin-top:10px"><a href="<?php echo esc_url( add_query_arg( 'awivest', 'register', $portal ) ); ?>">Start over</a></p>
		</div>
		<?php
	}

	private function render_lostpassword_form() {
		?>
		<form method="post" class="awivest-form">
			<?php wp_nonce_field( 'awivest_request_reset', 'awivest_nonce' ); ?>
			<input type="hidden" name="awivest_action" value="request_reset">
			<h3>Reset your password</h3>
			<p>Enter the email address or Investor ID on your account and we will email you a secure link to set a new password.</p>
			<label>Email or Investor ID<input type="text" name="identifier" required></label>
			<button type="submit" class="awivest-btn">Email me a reset link</button>
			<p><a href="<?php echo esc_url( add_query_arg( 'awivest', 'login', AWIVEST_Auth::instance()->portal_url() ) ); ?>">Back to login</a></p>
		</form>
		<?php
	}

	private function render_resetpass_form() {
		$key   = isset( $_GET['key'] ) ? sanitize_text_field( wp_unslash( $_GET['key'] ) ) : '';
		$login = isset( $_GET['login'] ) ? sanitize_text_field( wp_unslash( $_GET['login'] ) ) : '';
		$check = ( '' !== $key && '' !== $login ) ? check_password_reset_key( $key, $login ) : new WP_Error( 'missing', 'missing' );
		if ( is_wp_error( $check ) ) {
			echo '<h3>Reset your password</h3>';
			echo '<p>This password reset link is invalid or has expired.</p>';
			echo '<p><a class="awivest-btn" href="' . esc_url( add_query_arg( 'awivest', 'lostpassword', AWIVEST_Auth::instance()->portal_url() ) ) . '">Request a new link</a></p>';
			return;
		}
		?>
		<form method="post" class="awivest-form">
			<?php wp_nonce_field( 'awivest_do_reset', 'awivest_nonce' ); ?>
			<input type="hidden" name="awivest_action" value="do_reset">
			<input type="hidden" name="key" value="<?php echo esc_attr( $key ); ?>">
			<input type="hidden" name="login" value="<?php echo esc_attr( $login ); ?>">
			<h3>Choose a new password</h3>
			<label>New Password<input type="password" name="password" minlength="8" required></label>
			<label>Confirm New Password<input type="password" name="password2" minlength="8" required></label>
			<button type="submit" class="awivest-btn">Set new password</button>
		</form>
		<?php
	}

	private function render_inactive_notice( $inv ) {
		echo '<div class="awivest-card awivest-notice">';
		echo '<h3>Your account is inactive</h3>';
		echo '<p>Your AWIVEST account is currently inactive. If you disagreed with a membership agreement or believe this is a mistake, please contact AWIVEST to reactivate your account.</p>';
		echo '</div>';
	}

	private function render_nav( $view, $active ) {
		$base = AWIVEST_Auth::instance()->portal_url();
		if ( $active ) {
			$items = array(
				'dashboard'     => 'Dashboard',
				'profile'       => 'Profile',
				'msi'           => 'Financial Profile',
				'tools'         => 'Planning Tools',
				'forms'         => 'Forms',
				'kyc'           => 'KYC Documents',
				'documents'     => 'Documents',
				'statements'    => 'Statements',
				'agreements'    => 'Agreements',
				'welfare'       => 'Welfare',
				'opportunities' => 'Opportunities',
				'payments'      => 'Payments',
				'dividends'     => 'Dividends',
				'tracking'      => 'Submissions',
			);
		} else {
			$items = array(
				'dashboard' => 'Dashboard',
				'profile'   => 'Profile',
				'kyc'       => 'KYC Documents',
			);
		}
		echo '<nav class="awivest-nav">';
		foreach ( $items as $k => $label ) {
			$url = add_query_arg( 'view', $k, $base );
			$cls = $view === $k ? 'active' : '';
			echo '<a class="' . esc_attr( $cls ) . '" href="' . esc_url( $url ) . '">' . wp_kses_post( $label ) . '</a>';
		}
		echo '<a href="' . esc_url( wp_logout_url( $base ) ) . '">Logout</a>';
		echo '</nav>';
	}

	private function badge( $status ) {
		return '<span class="awivest-badge ' . esc_attr( $status ) . '">' . esc_html( ucfirst( str_replace( '_', ' ', $status ) ) ) . '</span>';
	}

	private function view_dashboard() {
		$inv  = $this->investor();
		$user = wp_get_current_user();
		echo '<div class="awivest-card">';
		echo '<h2>Welcome, ' . esc_html( $inv ? $inv->full_name : $user->display_name ) . '</h2>';
		if ( $inv ) {
			echo '<div class="awivest-grid">';
			if ( $this->is_active( $inv ) ) {
				echo '<div class="awivest-stat"><span>Investor ID</span><strong>' . esc_html( $inv->investor_id ) . '</strong></div>';
			} else {
				echo '<div class="awivest-stat"><span>Investor ID</span><strong>Pending approval</strong></div>';
			}
			echo '<div class="awivest-stat"><span>Account Status</span>' . $this->badge( $inv->status ) . '</div>';
			echo '<div class="awivest-stat"><span>KYC Status</span>' . $this->badge( $inv->kyc_status ) . '</div>';
			echo '</div>';
		}
		echo '</div>';

		// Pending-approval guidance.
		if ( ! $this->is_active( $inv ) ) {
			echo '<div class="awivest-card awivest-notice">';
			if ( $inv && in_array( $inv->status, array( 'deactivated', 'archived' ), true ) ) {
				echo '<h3>Your account is inactive</h3>';
				echo '<p>Your AWIVEST account is currently inactive. If you disagreed with a membership agreement or believe this is a mistake, please contact AWIVEST to reactivate your account.</p>';
				echo '</div>';
				return;
			}
			echo '<h3>Get your account approved</h3>';
			echo '<p>Your account is awaiting verification. To get approved, please go to <strong>KYC Documents</strong> and upload your identification and required documents, then wait for our team to verify them.</p>';
			echo '<p>Once approved, you will receive an email and gain access to forms, documents, statements, welfare and more.</p>';
			echo '<p><a class="awivest-btn" href="' . esc_url( add_query_arg( 'view', 'kyc', AWIVEST_Auth::instance()->portal_url() ) ) . '">Upload KYC Documents</a></p>';
			echo '</div>';
			return;
		}

		// Financial Profile (MSI) call-to-action.
		if ( class_exists( 'AWIVEST_MSI' ) ) {
			AWIVEST_MSI::instance()->render_dashboard_card( $inv );
		}

		// Active members: agreements + announcements.
		global $wpdb;
		$agreements = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::agreements() . ' WHERE investor_id = %s ORDER BY created_at DESC LIMIT 10', $inv->investor_id ) );
		if ( $agreements ) {
			echo '<div class="awivest-card"><h3>Agreements</h3><table class="awivest-table"><thead><tr><th>Title</th><th>Status</th><th>Date</th></tr></thead><tbody>';
			foreach ( $agreements as $a ) {
				$when = $a->signed_at ? $a->signed_at : $a->created_at;
				echo '<tr><td>' . esc_html( $a->title ) . '</td><td>' . $this->badge( $a->status ) . '</td><td>' . esc_html( mysql2date( 'M j, Y', $when ) ) . '</td></tr>';
			}
			echo '</tbody></table></div>';
		}

		$announce = get_option( 'awivest_announcement', '' );
		if ( $announce ) {
			echo '<div class="awivest-card"><h3>Announcements</h3>' . wp_kses_post( wpautop( $announce ) ) . '</div>';
		}
	}

	private function view_profile() {
		$inv  = $this->investor();
		$user = wp_get_current_user();
		?>
		<div class="awivest-card">
			<h2>My Profile</h2>
			<form method="post" class="awivest-form">
				<?php wp_nonce_field( 'awivest_profile', 'awivest_nonce' ); ?>
				<input type="hidden" name="awivest_action" value="update_profile">
				<label>Full Name<input type="text" name="full_name" value="<?php echo esc_attr( $inv ? $inv->full_name : '' ); ?>"></label>
				<label>Email (read-only)<input type="email" value="<?php echo esc_attr( $user->user_email ); ?>" readonly></label>
				<label>Phone<input type="text" name="phone" value="<?php echo esc_attr( $inv ? $inv->phone : '' ); ?>"></label>
				<button class="awivest-btn" type="submit">Save Changes</button>
			</form>
		</div>
		<?php
		$this->view_member_details( $inv );
		$this->view_tracking();
	}

	/** Read-only summary of the onboarding details a member submitted at sign-up. */
	private function view_member_details( $inv ) {
		if ( ! $inv ) {
			return;
		}
		$g = function ( $k ) use ( $inv ) {
			return ( is_object( $inv ) && isset( $inv->$k ) ) ? trim( (string) $inv->$k ) : '';
		};
		$dob = substr( $g( 'dob' ), 0, 10 );
		if ( '0000-00-00' === $dob ) {
			$dob = '';
		}
		$nok = trim( $g( 'nok_name' ) . ( $g( 'nok_relationship' ) ? ' (' . $g( 'nok_relationship' ) . ')' : '' ) );
		$ben = trim( $g( 'beneficiary_name' ) . ( $g( 'beneficiary_relationship' ) ? ' (' . $g( 'beneficiary_relationship' ) . ')' : '' ) );
		$nom = trim( $g( 'nominee_name' ) . ( $g( 'nominee_relationship' ) ? ' (' . $g( 'nominee_relationship' ) . ')' : '' ) );
		$fields = array(
			'Investor ID'       => $this->is_active( $inv ) ? $inv->investor_id : 'Pending approval',
			'ID / Passport No'  => $g( 'id_number' ),
			'KRA PIN'           => $g( 'kra_pin' ),
			'Date of birth'     => $dob,
			'Postal address'    => $g( 'postal_address' ),
			'Physical address'  => $g( 'physical_address' ),
			'Next of kin'       => $nok,
			'Next of kin phone' => $g( 'nok_phone' ),
			'Beneficiary'       => $ben,
			'Beneficiary phone' => $g( 'beneficiary_phone' ),
			'Nominee'           => $nom,
			'Nominee phone'     => $g( 'nominee_phone' ),
		);
		echo '<div class="awivest-card"><h2>My Registered Details</h2>';
		echo '<p class="awivest-hint">These are the details you submitted during sign-up. To change them, please contact AWIVEST.</p>';
		echo '<table class="awivest-table"><tbody>';
		foreach ( $fields as $label => $val ) {
			$val = '' === (string) $val ? '-' : $val;
			echo '<tr><th style="text-align:left;width:220px">' . esc_html( $label ) . '</th><td>' . esc_html( $val ) . '</td></tr>';
		}
		echo '</tbody></table></div>';
	}

	private function view_kyc() {
		$types = array( 'National ID/Passport', 'KRA PIN', 'Bank Document', 'Proof of Address', 'Signed Agreement', 'Other Supporting Document' );
		?>
		<div class="awivest-card">
			<h2>KYC &amp; Document Upload</h2>
			<p class="awivest-hint">Upload your identification and required documents here. Our team will verify them and activate your account.</p>
			<form method="post" enctype="multipart/form-data" class="awivest-form awivest-upload">
				<?php wp_nonce_field( 'awivest_kyc', 'awivest_nonce' ); ?>
				<input type="hidden" name="awivest_action" value="kyc_upload">
				<label>Document Type
					<select name="document_type">
						<?php foreach ( $types as $t ) { echo '<option value="' . esc_attr( $t ) . '">' . esc_html( $t ) . '</option>'; } ?>
					</select>
				</label>
				<div class="awivest-dropzone" id="awivest-dropzone">
					<p>Drag &amp; drop your file here, or click to browse</p>
					<input type="file" name="kyc_file" id="awivest-file" accept=".pdf,.jpg,.jpeg,.png,.docx" required>
					<div class="awivest-filename"></div>
				</div>
				<p class="awivest-hint">Allowed: PDF, JPG, PNG, DOCX. Max <?php echo (int) get_option( 'awivest_max_upload_mb', 10 ); ?>MB.</p>
				<button class="awivest-btn" type="submit">Upload Document</button>
			</form>
		</div>
		<?php
		$this->view_tracking();
	}

	private function view_documents() {
		$inv = $this->investor();
		global $wpdb;
		$docs = $wpdb->get_results(
			$wpdb->prepare(
				'SELECT * FROM ' . AWIVEST_DB::documents() . " WHERE (visibility = 'all' OR investor_id = %s) AND document_type NOT IN ('statement','report') ORDER BY created_at DESC",
				$inv ? $inv->investor_id : ''
			)
		);
		echo '<div class="awivest-card"><h2>Secure Document Center</h2>';
		echo '<input type="text" class="awivest-search" data-target="awivest-docs" placeholder="Search documents...">';
		echo '<table class="awivest-table" id="awivest-docs"><thead><tr><th>Title</th><th>Type</th><th>Date</th><th></th></tr></thead><tbody>';
		if ( $docs ) {
			foreach ( $docs as $d ) {
				echo '<tr><td>' . esc_html( $d->title ) . '</td><td>' . esc_html( $d->document_type ) . '</td><td>' . esc_html( mysql2date( 'M j, Y', $d->created_at ) ) . '</td><td><a class="awivest-btn small" href="' . esc_url( AWIVEST_Documents::view_url( 'document', $d->id ) ) . '" target="_blank" rel="noopener">View</a> <a class="awivest-btn small awivest-btn-outline" href="' . esc_url( AWIVEST_Documents::download_url( 'document', $d->id ) ) . '">Download</a></td></tr>';
			}
		} else {
			echo '<tr><td colspan="4">No documents available yet.</td></tr>';
		}
		echo '</tbody></table></div>';
	}

	private function view_statements() {
		$inv = $this->investor();
		global $wpdb;
		$docs = $wpdb->get_results(
			$wpdb->prepare(
				'SELECT * FROM ' . AWIVEST_DB::documents() . " WHERE (visibility = 'all' OR investor_id = %s) AND document_type IN ('statement','report') ORDER BY created_at DESC",
				$inv ? $inv->investor_id : ''
			)
		);
		echo '<div class="awivest-card"><h2>Statements &amp; Reports</h2>';
		echo '<table class="awivest-table"><thead><tr><th>Title</th><th>Type</th><th>Date</th><th></th></tr></thead><tbody>';
		if ( $docs ) {
			foreach ( $docs as $d ) {
				echo '<tr><td>' . esc_html( $d->title ) . '</td><td>' . esc_html( $d->document_type ) . '</td><td>' . esc_html( mysql2date( 'M j, Y', $d->created_at ) ) . '</td><td><a class="awivest-btn small" href="' . esc_url( AWIVEST_Documents::view_url( 'document', $d->id ) ) . '" target="_blank" rel="noopener">View</a> <a class="awivest-btn small awivest-btn-outline" href="' . esc_url( AWIVEST_Documents::download_url( 'document', $d->id ) ) . '">Download</a></td></tr>';
			}
		} else {
			echo '<tr><td colspan="4">No statements or reports available yet.</td></tr>';
		}
		echo '</tbody></table></div>';
	}

	private function view_tracking() {
		$inv = $this->investor();
		if ( ! $inv ) {
			return;
		}
		global $wpdb;
		$rows = $wpdb->get_results(
			$wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::kyc() . ' WHERE investor_id = %s ORDER BY created_at DESC', $inv->investor_id )
		);
		echo '<div class="awivest-card"><h2>Submission Tracking</h2>';
		echo '<table class="awivest-table"><thead><tr><th>Document</th><th>Type</th><th>Status</th><th>Admin Comment</th><th>Date</th><th></th></tr></thead><tbody>';
		if ( $rows ) {
			foreach ( $rows as $r ) {
				echo '<tr><td>' . esc_html( $r->original_name ) . '</td><td>' . esc_html( $r->document_type ) . '</td><td>' . $this->badge( $r->status ) . '</td><td>' . esc_html( $r->admin_comment ) . '</td><td>' . esc_html( mysql2date( 'M j, Y', $r->created_at ) ) . '</td><td><a class="awivest-btn small" href="' . esc_url( AWIVEST_Documents::view_url( 'kyc', $r->id ) ) . '" target="_blank" rel="noopener">View</a> <a class="awivest-btn small awivest-btn-outline" href="' . esc_url( AWIVEST_Documents::download_url( 'kyc', $r->id ) ) . '">Download</a></td></tr>';
			}
		} else {
			echo '<tr><td colspan="6">No submissions yet.</td></tr>';
		}
		echo '</tbody></table></div>';
	}
}
