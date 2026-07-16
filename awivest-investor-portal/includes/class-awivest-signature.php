<?php
/**
 * Lightweight internal digital-signature module (Phase 1).
 *
 * Captures a signature as a PNG data URL (drawn or typed via the signature pad
 * in awivest.js), validates it, stores it in the protected directory, and records
 * an agreement row. Phase 2 can swap this for the PandaDoc API using the stored key.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Signature {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'handle_sign' ) );
	}

	public function handle_sign() {
		if ( empty( $_POST['awivest_action'] ) || 'sign_agreement' !== $_POST['awivest_action'] ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in.' );
		}
		if ( ! isset( $_POST['awivest_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['awivest_nonce'] ) ), 'awivest_sign' ) ) {
			wp_die( 'Security check failed.' );
		}

		$investor = AWIVEST_DB::get_investor_by_user( get_current_user_id() );
		if ( ! $investor ) {
			wp_die( 'Investor profile not found.' );
		}

		$title    = isset( $_POST['agreement_title'] ) ? sanitize_text_field( wp_unslash( $_POST['agreement_title'] ) ) : 'Agreement';
		$data_url = isset( $_POST['signature_data'] ) ? wp_unslash( $_POST['signature_data'] ) : '';

		$path = $this->store_signature_png( $data_url, $investor->investor_id );
		if ( is_wp_error( $path ) ) {
			AWIVEST_Auth::instance()->flash( 'error', array( $path->get_error_message() ) );
			wp_safe_redirect( add_query_arg( 'view', 'kyc', AWIVEST_Auth::instance()->portal_url() ) );
			exit;
		}

		global $wpdb;
		$wpdb->insert(
			AWIVEST_DB::agreements(),
			array(
				'investor_id'    => $investor->investor_id,
				'title'          => $title,
				'signature_path' => $path,
				'status'         => 'signed',
				'signed_at'      => current_time( 'mysql' ),
				'created_at'     => current_time( 'mysql' ),
			)
		);

		AWIVEST_DB::log( $investor->investor_id, 'sign', $title );
		AWIVEST_Notifications::send( AWIVEST_Notifications::admin_email(), 'Agreement signed', array( 'Investor ' . esc_html( $investor->investor_id ) . ' signed: ' . esc_html( $title ) . '.' ) );

		AWIVEST_Auth::instance()->flash( 'success', array( 'Your signature was captured and stored securely.' ) );
		wp_safe_redirect( add_query_arg( 'view', 'kyc', AWIVEST_Auth::instance()->portal_url() ) );
		exit;
	}

	/**
	 * Decode a base64 PNG data URL and store it. Returns the relative path or WP_Error.
	 */
	private function store_signature_png( $data_url, $investor_id ) {
		if ( ! preg_match( '#^data:image/png;base64,#', $data_url ) ) {
			return new WP_Error( 'sig', 'No valid signature was provided.' );
		}
		$encoded = substr( $data_url, strpos( $data_url, ',' ) + 1 );
		$binary  = base64_decode( $encoded, true );
		if ( false === $binary || strlen( $binary ) < 64 ) {
			return new WP_Error( 'sig', 'The signature could not be processed.' );
		}
		if ( strlen( $binary ) > 2 * 1024 * 1024 ) {
			return new WP_Error( 'sig', 'Signature image is too large.' );
		}

		$base = AWIVEST_Activator::upload_basedir();
		$sub  = trailingslashit( $base ) . 'signatures';
		if ( ! file_exists( $sub ) ) {
			wp_mkdir_p( $sub );
		}
		$name = sanitize_file_name( $investor_id ) . '-' . time() . '.png';
		$dest = trailingslashit( $sub ) . $name;
		if ( false === file_put_contents( $dest, $binary ) ) {
			return new WP_Error( 'sig', 'Could not save the signature.' );
		}
		@chmod( $dest, 0640 );
		return ltrim( str_replace( trailingslashit( $base ), '', $dest ), '/' );
	}
}
