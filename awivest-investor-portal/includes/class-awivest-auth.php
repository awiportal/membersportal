<?php
/**
 * Authentication: registration, login (email OR Investor ID), profile updates,
 * and a portal-native lost-password / reset-password flow (no wp-login.php).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Auth {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'handle_forms' ) );
		// Allow login by Investor ID through the standard auth pipeline.
		add_filter( 'authenticate', array( $this, 'authenticate_investor_id' ), 30, 3 );
	}

	public function handle_forms() {
		if ( empty( $_POST['awivest_action'] ) ) {
			return;
		}
		$action = sanitize_key( wp_unslash( $_POST['awivest_action'] ) );
		switch ( $action ) {
			case 'register':
				$this->register();
				break;
			case 'verify_email':
				$this->verify_email();
				break;
			case 'resend_code':
				$this->resend_code();
				break;
			case 'login':
				$this->login();
				break;
			case 'update_profile':
				$this->update_profile();
				break;
			case 'request_reset':
				$this->request_reset();
				break;
			case 'do_reset':
				$this->do_reset();
				break;
		}
	}

	private function verify( $nonce_action ) {
		if ( ! isset( $_POST['awivest_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['awivest_nonce'] ) ), $nonce_action ) ) {
			wp_die( 'Security check failed. Please go back and try again.' );
		}
	}

	private function register() {
		$this->verify( 'awivest_register' );

		$full_name = isset( $_POST['full_name'] ) ? sanitize_text_field( wp_unslash( $_POST['full_name'] ) ) : '';
		$email     = isset( $_POST['email'] ) ? sanitize_email( wp_unslash( $_POST['email'] ) ) : '';
		$phone     = isset( $_POST['phone'] ) ? sanitize_text_field( wp_unslash( $_POST['phone'] ) ) : '';
		$password  = isset( $_POST['password'] ) ? (string) $_POST['password'] : '';

		$errors = AWIVEST_Security::verify_registration();
		if ( strlen( $full_name ) < 2 ) {
			$errors[] = 'Please enter your full name.';
		}
		if ( ! is_email( $email ) ) {
			$errors[] = 'Please enter a valid email address.';
		}
		if ( email_exists( $email ) ) {
			$errors[] = 'An account with this email already exists.';
		}
		if ( strlen( $password ) < 8 ) {
			$errors[] = 'Password must be at least 8 characters.';
		}

		if ( $errors ) {
			$this->flash( 'error', $errors );
			return;
		}

		// Email-verify BEFORE creating the account: send a one-time code and hold
		// the pending details in a short-lived transient. The account is created
		// only once the code is confirmed, so bots and fake email addresses never
		// produce real accounts.
		$token = wp_generate_password( 24, false, false );
		$code  = (string) wp_rand( 100000, 999999 );
		set_transient(
			$this->pending_key( $token ),
			array(
				'full_name' => $full_name,
				'email'     => $email,
				'phone'     => $phone,
				'pass_hash' => wp_hash_password( $password ),
				'code_hash' => $this->hash_code( $code ),
				'attempts'  => 0,
				'resends'   => 0,
				'last_sent' => time(),
			),
			15 * MINUTE_IN_SECONDS
		);
		$this->send_code( $email, $full_name, $code );
		$this->flash( 'success', array( 'We have emailed a 6-digit verification code to ' . esc_html( $email ) . '. Enter it below to finish creating your account. The code expires in 15 minutes. If you do not see the email within a minute, please check your spam or junk folder.' ) );
		wp_safe_redirect( add_query_arg( array( 'awivest' => 'verify', 'pending' => $token ), $this->portal_url() ) );
		exit;
	}

	/** Verification transient key for a pending sign-up token. */
	private function pending_key( $token ) {
		return 'awivest_reg_pending_' . preg_replace( '/[^A-Za-z0-9]/', '', (string) $token );
	}

	/** One-way hash of a verification code (never store the raw code). */
	private function hash_code( $code ) {
		return hash_hmac( 'sha256', (string) $code, wp_salt( 'auth' ) );
	}

	/** Email a verification code to a pending registrant. */
	private function send_code( $email, $full_name, $code ) {
		AWIVEST_Notifications::send(
			$email,
			'Your AWIVEST verification code',
			array(
				'Hello ' . esc_html( $full_name ) . ',',
				'Your AWIVEST verification code is:',
				'<div style="font-size:28px;font-weight:700;letter-spacing:4px;margin:12px 0">' . esc_html( $code ) . '</div>',
				'Enter this code on the sign-up page to finish creating your account. It expires in 15 minutes.',
				'Tip: if this email is in your spam or junk folder, please mark it as "Not spam" so future AWIVEST emails reach your inbox.',
				'If you did not request this, you can safely ignore this email.',
			)
		);
	}

	/**
	 * Step 2 of registration: confirm the emailed code, then create the account.
	 */
	private function verify_email() {
		$this->verify( 'awivest_verify_email' );
		$token = isset( $_POST['pending'] ) ? sanitize_text_field( wp_unslash( $_POST['pending'] ) ) : '';
		$code  = isset( $_POST['code'] ) ? preg_replace( '/[^0-9]/', '', (string) wp_unslash( $_POST['code'] ) ) : '';
		$key   = $this->pending_key( $token );
		$data  = get_transient( $key );

		$back_to_verify = add_query_arg( array( 'awivest' => 'verify', 'pending' => $token ), $this->portal_url() );

		if ( ! is_array( $data ) ) {
			$this->flash( 'error', array( 'Your verification code has expired. Please sign up again.' ) );
			wp_safe_redirect( add_query_arg( 'awivest', 'register', $this->portal_url() ) );
			exit;
		}
		if ( (int) $data['attempts'] >= 5 ) {
			delete_transient( $key );
			$this->flash( 'error', array( 'Too many incorrect attempts. Please sign up again.' ) );
			wp_safe_redirect( add_query_arg( 'awivest', 'register', $this->portal_url() ) );
			exit;
		}
		if ( '' === $code || ! hash_equals( (string) $data['code_hash'], $this->hash_code( $code ) ) ) {
			$data['attempts'] = (int) $data['attempts'] + 1;
			set_transient( $key, $data, 15 * MINUTE_IN_SECONDS );
			$left = max( 0, 5 - (int) $data['attempts'] );
			$this->flash( 'error', array( 'That code is not correct. ' . (int) $left . ' attempt(s) left.' ) );
			wp_safe_redirect( $back_to_verify );
			exit;
		}

		// Code correct: create the account now.
		if ( email_exists( $data['email'] ) ) {
			delete_transient( $key );
			$this->flash( 'error', array( 'An account with this email already exists. Please log in.' ) );
			wp_safe_redirect( add_query_arg( 'awivest', 'login', $this->portal_url() ) );
			exit;
		}
		$user_id = $this->create_member( $data['full_name'], $data['email'], $data['phone'], $data['pass_hash'] );
		if ( is_wp_error( $user_id ) ) {
			$this->flash( 'error', array( $user_id->get_error_message() ) );
			wp_safe_redirect( $back_to_verify );
			exit;
		}
		delete_transient( $key );

		// Auto sign-in after a verified registration.
		wp_set_current_user( $user_id );
		wp_set_auth_cookie( $user_id, true, is_ssl() );
		$this->flash( 'success', array( 'Your email is verified and your account is created. Welcome to AWIVEST.' ) );
		wp_safe_redirect( add_query_arg( 'awivest', 'registered', $this->portal_url() ) );
		exit;
	}

	/** Re-send a fresh verification code for a pending sign-up (rate-limited). */
	private function resend_code() {
		$this->verify( 'awivest_resend_code' );
		$token          = isset( $_POST['pending'] ) ? sanitize_text_field( wp_unslash( $_POST['pending'] ) ) : '';
		$key            = $this->pending_key( $token );
		$data           = get_transient( $key );
		$back_to_verify = add_query_arg( array( 'awivest' => 'verify', 'pending' => $token ), $this->portal_url() );

		if ( ! is_array( $data ) ) {
			$this->flash( 'error', array( 'Your session has expired. Please sign up again.' ) );
			wp_safe_redirect( add_query_arg( 'awivest', 'register', $this->portal_url() ) );
			exit;
		}
		if ( (int) $data['resends'] >= 4 ) {
			$this->flash( 'error', array( 'You have requested too many codes. Please sign up again in a few minutes.' ) );
			wp_safe_redirect( $back_to_verify );
			exit;
		}
		if ( ( time() - (int) $data['last_sent'] ) < 60 ) {
			$this->flash( 'error', array( 'Please wait a moment before requesting another code.' ) );
			wp_safe_redirect( $back_to_verify );
			exit;
		}
		$code              = (string) wp_rand( 100000, 999999 );
		$data['code_hash'] = $this->hash_code( $code );
		$data['resends']   = (int) $data['resends'] + 1;
		$data['last_sent'] = time();
		$data['attempts']  = 0;
		set_transient( $key, $data, 15 * MINUTE_IN_SECONDS );
		$this->send_code( $data['email'], $data['full_name'], $code );
		$this->flash( 'success', array( 'We have sent a new code to ' . esc_html( $data['email'] ) . '.' ) );
		wp_safe_redirect( $back_to_verify );
		exit;
	}

	/** Create the WP user + investor record for a verified sign-up. */
	private function create_member( $full_name, $email, $phone, $pass_hash ) {
		$user_id = wp_insert_user(
			array(
				'user_login'   => $email,
				'user_email'   => $email,
				'user_pass'    => wp_generate_password( 24, true, true ),
				'display_name' => $full_name,
				'role'         => AWIVEST_ROLE,
			)
		);
		if ( is_wp_error( $user_id ) ) {
			return $user_id;
		}

		global $wpdb;
		// Apply the password the member actually chose (already a WP hash), so we
		// never have to store their plaintext password anywhere.
		$wpdb->update( $wpdb->users, array( 'user_pass' => $pass_hash ), array( 'ID' => $user_id ) );
		clean_user_cache( $user_id );

		$investor_id = AWIVEST_DB::generate_investor_id();
		$wpdb->insert(
			AWIVEST_DB::investors(),
			array(
				'investor_id' => $investor_id,
				'wp_user_id'  => $user_id,
				'full_name'   => $full_name,
				'phone'       => $phone,
				'status'      => 'pending',
				'kyc_status'  => 'not_submitted',
				'created_at'  => current_time( 'mysql' ),
			)
		);

		AWIVEST_DB::log( $investor_id, 'register', 'New investor registered (email verified)' );

		AWIVEST_Notifications::send(
			$email,
			'Registration received',
			array(
				'Thank you for registering with AWIVEST. Your application has been received and is now with our team for review.',
				'Please log in and complete your onboarding: fill in your personal details, upload your documents, and sign your membership forms.',
				'Your official Investor ID will be issued once your membership is approved by our admin team - you will receive it by email at that point.',
				'If our messages land in your spam or junk folder, please mark them as "Not spam" so future emails reach your inbox.',
			)
		);
		AWIVEST_Notifications::send(
			AWIVEST_Notifications::admin_email(),
			'New investor registration',
			array( 'A new investor has registered (email verified): ' . esc_html( $full_name ) . ' (' . esc_html( $email ) . '), Investor ID ' . esc_html( $investor_id ) . '.' )
		);

		return $user_id;
	}

	private function login() {
		$this->verify( 'awivest_login' );
		$identifier = isset( $_POST['identifier'] ) ? sanitize_text_field( wp_unslash( $_POST['identifier'] ) ) : '';
		$password   = isset( $_POST['password'] ) ? (string) $_POST['password'] : '';
		$remember   = ! empty( $_POST['remember'] );

		$user = wp_signon(
			array(
				'user_login'    => $identifier,
				'user_password' => $password,
				'remember'      => $remember,
			),
			is_ssl()
		);

		if ( is_wp_error( $user ) ) {
			$this->flash( 'error', array( 'Invalid credentials. Please check your email / Investor ID and password.' ) );
			return;
		}
		wp_safe_redirect( $this->portal_url() );
		exit;
	}

	/**
	 * Resolve an Investor ID to its WP account so wp_signon can authenticate it.
	 */
	public function authenticate_investor_id( $user, $username, $password ) {
		if ( $user instanceof WP_User ) {
			return $user;
		}
		if ( empty( $username ) || stripos( $username, 'AWV-' ) !== 0 ) {
			return $user;
		}
		$row = AWIVEST_DB::get_investor_by_investor_id( $username );
		if ( $row ) {
			$wp_user = get_user_by( 'id', $row->wp_user_id );
			if ( $wp_user ) {
				return wp_authenticate_username_password( null, $wp_user->user_login, $password );
			}
		}
		return $user;
	}

	private function update_profile() {
		$this->verify( 'awivest_profile' );
		if ( ! is_user_logged_in() ) {
			return;
		}
		$user_id   = get_current_user_id();
		$full_name = isset( $_POST['full_name'] ) ? sanitize_text_field( wp_unslash( $_POST['full_name'] ) ) : '';
		$phone     = isset( $_POST['phone'] ) ? sanitize_text_field( wp_unslash( $_POST['phone'] ) ) : '';

		global $wpdb;
		$wpdb->update( AWIVEST_DB::investors(), array( 'full_name' => $full_name, 'phone' => $phone ), array( 'wp_user_id' => $user_id ) );
		wp_update_user( array( 'ID' => $user_id, 'display_name' => $full_name ) );

		$this->flash( 'success', array( 'Profile updated.' ) );
		wp_safe_redirect( add_query_arg( 'view', 'profile', $this->portal_url() ) );
		exit;
	}

	/**
	 * Step 1 of password reset: look up the account by email or Investor ID and
	 * email a secure reset link back to the portal. Always shows a generic
	 * message so the form cannot be used to discover which accounts exist.
	 */
	private function request_reset() {
		$this->verify( 'awivest_request_reset' );
		$identifier = isset( $_POST['identifier'] ) ? sanitize_text_field( wp_unslash( $_POST['identifier'] ) ) : '';

		$user = false;
		if ( is_email( $identifier ) ) {
			$user = get_user_by( 'email', $identifier );
		}
		if ( ! $user && stripos( $identifier, 'AWV-' ) === 0 ) {
			$row = AWIVEST_DB::get_investor_by_investor_id( $identifier );
			if ( $row ) {
				$user = get_user_by( 'id', $row->wp_user_id );
			}
		}
		if ( ! $user ) {
			$user = get_user_by( 'login', $identifier );
		}

		if ( $user instanceof WP_User ) {
			$key = get_password_reset_key( $user );
			if ( ! is_wp_error( $key ) ) {
				$reset_url = add_query_arg(
					array(
						'awivest' => 'resetpass',
						'key'     => rawurlencode( $key ),
						'login'   => rawurlencode( $user->user_login ),
					),
					$this->portal_url()
				);
				AWIVEST_Notifications::send(
					$user->user_email,
					'Reset your AWIVEST password',
					array(
						'We received a request to reset the password for your AWIVEST investor account.',
						'Click the button below to choose a new password. For your security this link will expire shortly.',
						'<a class="awivest-btn" href="' . esc_url( $reset_url ) . '">Reset my password</a>',
						'If the button does not work, copy and paste this link into your browser:<br>' . esc_url( $reset_url ),
						'If you did not request this, you can safely ignore this email and your password will stay the same.',
					)
				);
			}
		}

		$this->flash( 'success', array( 'If an account matches that email or Investor ID, we have emailed a password reset link. Please check your inbox (and your spam folder).' ) );
		wp_safe_redirect( add_query_arg( 'awivest', 'login', $this->portal_url() ) );
		exit;
	}

	/**
	 * Step 2 of password reset: validate the reset key and set the new password.
	 */
	private function do_reset() {
		$this->verify( 'awivest_do_reset' );
		$login = isset( $_POST['login'] ) ? sanitize_text_field( wp_unslash( $_POST['login'] ) ) : '';
		$key   = isset( $_POST['key'] ) ? sanitize_text_field( wp_unslash( $_POST['key'] ) ) : '';
		$pass1 = isset( $_POST['password'] ) ? (string) $_POST['password'] : '';
		$pass2 = isset( $_POST['password2'] ) ? (string) $_POST['password2'] : '';

		$user = check_password_reset_key( $key, $login );
		if ( is_wp_error( $user ) ) {
			$this->flash( 'error', array( 'This password reset link is invalid or has expired. Please request a new one.' ) );
			wp_safe_redirect( add_query_arg( 'awivest', 'lostpassword', $this->portal_url() ) );
			exit;
		}

		$errors = array();
		if ( strlen( $pass1 ) < 8 ) {
			$errors[] = 'Password must be at least 8 characters.';
		}
		if ( $pass1 !== $pass2 ) {
			$errors[] = 'The two passwords do not match.';
		}
		if ( $errors ) {
			$this->flash( 'error', $errors );
			wp_safe_redirect(
				add_query_arg(
					array(
						'awivest' => 'resetpass',
						'key'     => rawurlencode( $key ),
						'login'   => rawurlencode( $login ),
					),
					$this->portal_url()
				)
			);
			exit;
		}

		reset_password( $user, $pass1 );
		$this->flash( 'success', array( 'Your password has been reset. You can now log in with your new password.' ) );
		wp_safe_redirect( add_query_arg( 'awivest', 'login', $this->portal_url() ) );
		exit;
	}

	public function portal_url() {
		$page_id = get_option( 'awivest_portal_page' );
		return $page_id ? get_permalink( $page_id ) : home_url( '/investor-portal/' );
	}

	/**
	 * Redirect that still works if a theme or plugin has already sent output
	 * (for example a stray PHP notice printed before headers). When headers are
	 * already sent, wp_safe_redirect() would fail with "Cannot modify header
	 * information" and strand the member on a blank / critical-error page, so we
	 * fall back to a meta refresh plus JS redirect and a manual link.
	 *
	 * @param string $url  Destination URL.
	 * @param bool   $safe Use wp_safe_redirect (same-host only). Pass false for
	 *                     trusted external URLs such as the PandaDoc signing page.
	 */
	public static function go( $url, $safe = true ) {
		if ( ! headers_sent() ) {
			if ( $safe ) {
				wp_safe_redirect( $url );
			} else {
				wp_redirect( $url );
			}
			exit;
		}
		$url = esc_url_raw( $url );
		echo '<meta http-equiv="refresh" content="0;url=' . esc_attr( $url ) . '">';
		echo '<script>window.location.href=' . wp_json_encode( $url ) . ';</script>';
		echo '<p style="font-family:sans-serif;padding:16px">Please <a href="' . esc_url( $url ) . '">click here to continue</a>.</p>';
		exit;
	}

	/**
	 * Per-visitor key for short-lived flash messages (works logged-out too).
	 */
	public function client_key() {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : '';
		return md5( $ip . '|' . get_current_user_id() );
	}

	public function flash( $type, $messages ) {
		set_transient( 'awivest_msg_' . $this->client_key(), array( 'type' => $type, 'messages' => (array) $messages ), 60 );
	}
}
