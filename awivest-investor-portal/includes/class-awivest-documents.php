<?php
/**
 * Secure document delivery. Files live outside the web root's reach (Deny from all),
 * and are streamed only after a logged-in user passes ownership / visibility checks.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Documents {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'handle_download' ) );
	}

	public function handle_download() {
		if ( ! isset( $_GET['awivest_download'] ) ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in to download documents.' );
		}
		$nonce = isset( $_GET['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, 'awivest_download' ) ) {
			wp_die( 'Invalid or expired download link.' );
		}

		$source   = isset( $_GET['source'] ) ? sanitize_key( wp_unslash( $_GET['source'] ) ) : 'document';
		$id       = isset( $_GET['id'] ) ? absint( $_GET['id'] ) : 0;
		$is_admin = current_user_can( 'manage_options' );
		$investor = AWIVEST_DB::get_investor_by_user( get_current_user_id() );

		global $wpdb;
		$relative      = '';
		$download_name = 'document';

		if ( 'kyc' === $source ) {
			$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::kyc() . ' WHERE id = %d', $id ) );
			if ( ! $row ) {
				wp_die( 'File not found.' );
			}
			if ( ! $is_admin && ( ! $investor || $investor->investor_id !== $row->investor_id ) ) {
				wp_die( 'Access denied.' );
			}
			$relative      = $row->file_path;
			$download_name = $row->original_name ? $row->original_name : basename( $row->file_path );
		} elseif ( 'welfare_claim' === $source ) {
			$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::welfare_claims() . ' WHERE id = %d', $id ) );
			if ( ! $row ) {
				wp_die( 'File not found.' );
			}
			if ( ! $is_admin && ( ! $investor || $investor->investor_id !== $row->investor_id ) ) {
				wp_die( 'Access denied.' );
			}
			$relative      = $row->file_path;
			$download_name = basename( $row->file_path );
		} elseif ( 'form_signature' === $source ) {
			$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::forms() . ' WHERE id = %d', $id ) );
			if ( ! $row ) {
				wp_die( 'File not found.' );
			}
			if ( ! $is_admin && ( ! $investor || $investor->investor_id !== $row->investor_id ) ) {
				wp_die( 'Access denied.' );
			}
			$relative      = $row->signature_path;
			$download_name = 'signature-' . $row->form_key . '.png';
		} else {
			$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::documents() . ' WHERE id = %d', $id ) );
			if ( ! $row ) {
				wp_die( 'File not found.' );
			}
			if ( ! $is_admin ) {
				if ( ! $investor ) {
					wp_die( 'Access denied.' );
				}
				if ( 'all' !== $row->visibility && $investor->investor_id !== $row->investor_id ) {
					wp_die( 'Access denied.' );
				}
			}
			$relative      = $row->file_path;
			$download_name = $row->title ? $row->title . '.' . pathinfo( $row->file_path, PATHINFO_EXTENSION ) : basename( $row->file_path );
		}

		// Resolve and confine the path inside the secure base directory.
		$base      = AWIVEST_Activator::upload_basedir();
		$path      = trailingslashit( $base ) . ltrim( $relative, '/' );
		$real_base = realpath( $base );
		$real_path = realpath( $path );
		if ( ! $real_path || ! $real_base || strpos( $real_path, $real_base ) !== 0 || ! is_file( $real_path ) ) {
			wp_die( 'File not available.' );
		}

		AWIVEST_DB::log( $investor ? $investor->investor_id : '', 'download', $source . ':' . $id );

		$mime = wp_check_filetype( $real_path );
		$mime = $mime['type'] ? $mime['type'] : 'application/octet-stream';

		// "View" opens supported files inline in the browser (new tab); everything
		// else, and any explicit download, is delivered as an attachment. Inline is
		// limited to images and PDFs so no risky file type is ever rendered inline.
		$disposition = 'attachment';
		if ( isset( $_GET['disp'] ) && 'view' === $_GET['disp'] && ( 0 === strpos( $mime, 'image/' ) || 'application/pdf' === $mime ) ) {
			$disposition = 'inline';
		}

		nocache_headers();
		header( 'Content-Type: ' . $mime );
		header( 'Content-Disposition: ' . $disposition . '; filename="' . sanitize_file_name( $download_name ) . '"' );
		header( 'Content-Length: ' . filesize( $real_path ) );
		readfile( $real_path );
		exit;
	}

	/**
	 * Build a nonce-protected download URL.
	 */
	public static function download_url( $source, $id ) {
		return self::file_url( $source, $id, 'download' );
	}

	/** Same file, opened inline in a new browser tab where supported. */
	public static function view_url( $source, $id ) {
		return self::file_url( $source, $id, 'view' );
	}

	private static function file_url( $source, $id, $disp ) {
		return add_query_arg(
			array(
				'awivest_download' => 1,
				'source'           => $source,
				'id'               => (int) $id,
				'disp'             => ( 'view' === $disp ) ? 'view' : 'download',
				'_wpnonce'         => wp_create_nonce( 'awivest_download' ),
			),
			home_url( '/' )
		);
	}
}
