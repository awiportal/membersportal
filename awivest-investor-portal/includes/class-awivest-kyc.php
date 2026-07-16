<?php
/**
 * KYC / document upload handling with server-side validation and protected storage.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_KYC {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'handle_upload' ) );
	}

	/**
	 * Whitelist of accepted extensions => mime types.
	 */
	public static function allowed_types() {
		return array(
			'pdf'  => 'application/pdf',
			'jpg'  => 'image/jpeg',
			'jpeg' => 'image/jpeg',
			'png'  => 'image/png',
			'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		);
	}

	public static function max_bytes() {
		$mb = (int) get_option( 'awivest_max_upload_mb', 10 );
		if ( $mb < 1 ) {
			$mb = 10;
		}
		return $mb * 1024 * 1024;
	}

	public function handle_upload() {
		if ( empty( $_POST['awivest_action'] ) || 'kyc_upload' !== $_POST['awivest_action'] ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in to upload documents.' );
		}
		if ( ! isset( $_POST['awivest_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['awivest_nonce'] ) ), 'awivest_kyc' ) ) {
			wp_die( 'Security check failed.' );
		}

		$investor = AWIVEST_DB::get_investor_by_user( get_current_user_id() );
		if ( ! $investor ) {
			wp_die( 'Investor profile not found.' );
		}

		$document_type = isset( $_POST['document_type'] ) ? sanitize_text_field( wp_unslash( $_POST['document_type'] ) ) : 'Other';

		if ( empty( $_FILES['kyc_file'] ) || empty( $_FILES['kyc_file']['name'] ) ) {
			$this->redirect_msg( 'error', 'Please choose a file to upload.' );
		}

		$stored = $this->store_file( $_FILES['kyc_file'] );
		if ( is_wp_error( $stored ) ) {
			$this->redirect_msg( 'error', $stored->get_error_message() );
		}

		global $wpdb;
		$wpdb->insert(
			AWIVEST_DB::kyc(),
			array(
				'investor_id'   => $investor->investor_id,
				'document_type' => $document_type,
				'file_path'     => $stored['relative'],
				'original_name' => $stored['original'],
				'status'        => 'pending',
				'created_at'    => current_time( 'mysql' ),
			)
		);

		$wpdb->update( AWIVEST_DB::investors(), array( 'kyc_status' => 'submitted' ), array( 'investor_id' => $investor->investor_id ) );

		AWIVEST_DB::log( $investor->investor_id, 'kyc_upload', $document_type );

		$user = wp_get_current_user();
		AWIVEST_Notifications::send( $user->user_email, 'Document received', array( 'We have received your ' . esc_html( $document_type ) . '. Our team will review it shortly.' ) );
		AWIVEST_Notifications::send(
			AWIVEST_Notifications::admin_email(),
			'New document submitted',
			array(
				'Investor ' . esc_html( $investor->investor_id ) . ' submitted a document for review.',
				'<strong>Type:</strong> ' . esc_html( $document_type ),
				'<strong>File:</strong> ' . esc_html( $stored['original'] ),
				'Review in admin: <a href="' . esc_url( admin_url( 'admin.php?page=awivest-submissions' ) ) . '">Submissions</a> (open the file there to view it).',
			)
		);

		$this->redirect_msg( 'success', 'Your document was uploaded and is pending review.' );
	}

	/**
	 * Validate and move an uploaded file into the protected directory.
	 * Reused by the admin document uploader.
	 *
	 * @return array|WP_Error array with relative path, original name, absolute path.
	 */
	public function store_file( $file ) {
		if ( ! empty( $file['error'] ) ) {
			return new WP_Error( 'upload', 'Upload failed. Please try again.' );
		}
		if ( $file['size'] > self::max_bytes() ) {
			return new WP_Error( 'size', 'File is too large. Maximum size is ' . (int) get_option( 'awivest_max_upload_mb', 10 ) . 'MB.' );
		}

		$ext = strtolower( pathinfo( $file['name'], PATHINFO_EXTENSION ) );
		if ( ! array_key_exists( $ext, self::allowed_types() ) ) {
			return new WP_Error( 'type', 'Unsupported file type. Allowed: PDF, JPG, PNG, DOCX.' );
		}

		// Defence in depth: confirm the real type matches the claimed extension.
		$check = wp_check_filetype_and_ext( $file['tmp_name'], $file['name'], self::allowed_types() );
		if ( empty( $check['ext'] ) && 'docx' !== $ext ) {
			// DOCX is frequently mis-detected on older PHP; allow it via the extension whitelist above.
			return new WP_Error( 'type', 'The file content does not match its extension.' );
		}

		$base = AWIVEST_Activator::upload_basedir();
		$sub  = trailingslashit( $base ) . gmdate( 'Y/m' );
		if ( ! file_exists( $sub ) ) {
			wp_mkdir_p( $sub );
		}

		$safe   = sanitize_file_name( $file['name'] );
		$unique = wp_unique_filename( $sub, uniqid( 'awv_', false ) . '-' . $safe );
		$dest   = trailingslashit( $sub ) . $unique;

		if ( ! @move_uploaded_file( $file['tmp_name'], $dest ) ) {
			if ( ! @rename( $file['tmp_name'], $dest ) ) {
				return new WP_Error( 'move', 'Could not save the file on the server.' );
			}
		}
		@chmod( $dest, 0640 );

		$relative = ltrim( str_replace( trailingslashit( $base ), '', $dest ), '/' );
		return array(
			'relative' => $relative,
			'original' => $safe,
			'absolute' => $dest,
		);
	}

	private function redirect_msg( $type, $message ) {
		AWIVEST_Auth::instance()->flash( $type, array( $message ) );
		wp_safe_redirect( add_query_arg( 'view', 'kyc', AWIVEST_Auth::instance()->portal_url() ) );
		exit;
	}
}
