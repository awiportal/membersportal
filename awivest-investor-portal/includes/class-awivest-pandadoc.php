<?php
/**
 * Phase 2 (completed in 2.2.3): PandaDoc e-signature integration.
 *
 * When a PandaDoc API key is set (AWIVEST > Settings), admins can send an
 * agreement to an investor for legally-binding signing. The document is created
 * from a template, then automatically advanced from draft to "sent" so the
 * investor receives the signing email. A REST webhook receives status changes
 * and marks the agreement signed. Members can also sign in-portal via an
 * embedded signing session. With no key set, the plugin silently falls back to
 * the internal signature module (class-awivest-signature).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_PandaDoc {

	const API_BASE  = 'https://api.pandadoc.com/public/v1';
	const APP_SIGN  = 'https://app.pandadoc.com/s/';
	const CRON_HOOK = 'awivest_pandadoc_autosend';

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_menu', array( $this, 'menu' ), 11 );
		add_action( 'admin_init', array( $this, 'admin_handle' ) );
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_action( 'template_redirect', array( $this, 'maybe_handle_member_sign' ) );
		add_action( 'template_redirect', array( $this, 'maybe_handle_onboarding' ) );
		add_action( 'template_redirect', array( $this, 'handle_signed_download' ) );
		add_action( self::CRON_HOOK, array( $this, 'cron_autosend' ), 10, 1 );
	}

	public static function api_key() {
		return trim( (string) get_option( 'awivest_pandadoc_api_key', '' ) );
	}

	public static function template_id() {
		return trim( (string) get_option( 'awivest_pandadoc_template_id', '' ) );
	}

	public static function onboarding_template_id() {
		return trim( (string) get_option( 'awivest_pandadoc_onboarding_template', '' ) );
	}

	public static function signer_role() {
		$role = trim( (string) get_option( 'awivest_pandadoc_role', 'Investor' ) );
		return '' !== $role ? $role : 'Investor';
	}

	public static function is_configured() {
		return '' !== self::api_key();
	}

	/**
	 * Build PandaDoc template tokens (merge fields) from a member record so
	 * agreement templates auto-fill from what the member typed in the wizard.
	 * Add matching tokens to your PandaDoc template, e.g. [Investor.FullName].
	 */
	public static function prefill_tokens( $investor ) {
		$get = function ( $key ) use ( $investor ) {
			return ( is_object( $investor ) && isset( $investor->$key ) ) ? (string) $investor->$key : '';
		};
		$dob = substr( $get( 'dob' ), 0, 10 );
		if ( '0000-00-00' === $dob ) {
			$dob = '';
		}
		$user  = ( is_object( $investor ) && $investor->wp_user_id ) ? get_user_by( 'id', $investor->wp_user_id ) : null;
		$email = $user ? $user->user_email : '';

		$compose = function ( $name, $rel ) {
			$name = trim( $name );
			if ( '' === $name ) {
				return '';
			}
			$rel = trim( $rel );
			return '' !== $rel ? $name . ' (' . $rel . ')' : $name;
		};

		$pairs = array(
			'Investor.FullName'         => $get( 'full_name' ),
			'Investor.InvestorID'       => $get( 'investor_id' ),
			'Investor.IDNumber'         => $get( 'id_number' ),
			'Investor.KRAPIN'           => $get( 'kra_pin' ),
			'Investor.DOB'              => $dob,
			'Investor.Phone'            => $get( 'phone' ),
			'Investor.Email'            => $email,
			'Investor.PostalAddress'    => $get( 'postal_address' ),
			'Investor.PhysicalAddress'  => $get( 'physical_address' ),
			'Investor.NextOfKin'        => $compose( $get( 'nok_name' ), $get( 'nok_relationship' ) ),
			'Investor.NextOfKinPhone'   => $get( 'nok_phone' ),
			'Investor.Beneficiary'      => $compose( $get( 'beneficiary_name' ), $get( 'beneficiary_relationship' ) ),
			'Investor.BeneficiaryPhone' => $get( 'beneficiary_phone' ),
			'Investor.Nominee'          => $compose( $get( 'nominee_name' ), $get( 'nominee_relationship' ) ),
			'Investor.NomineePhone'     => $get( 'nominee_phone' ),
			'Investor.Date'             => gmdate( 'Y-m-d' ),
		);

		$tokens = array();
		foreach ( $pairs as $name => $value ) {
			$tokens[] = array( 'name' => $name, 'value' => $value );
		}
		return $tokens;
	}

	/* ---------------- Create + send ---------------- */

	public function send_for_signing( $investor, $agreement_title ) {
		if ( ! self::is_configured() ) {
			return new WP_Error( 'pandadoc', 'PandaDoc API key is not set. Add it in AWIVEST > Settings.' );
		}
		$template = self::template_id();
		if ( '' === $template ) {
			return new WP_Error( 'pandadoc', 'PandaDoc template ID is not set. Add it in AWIVEST > Settings.' );
		}

		$user = get_user_by( 'id', $investor->wp_user_id );
		if ( ! $user ) {
			return new WP_Error( 'pandadoc', 'Investor user account not found.' );
		}

		$name_parts = explode( ' ', trim( $investor->full_name ), 2 );
		$first      = $name_parts[0];
		$last       = isset( $name_parts[1] ) ? $name_parts[1] : '.';

		$body = array(
			'name'          => $agreement_title . ' - ' . $investor->investor_id,
			'template_uuid' => $template,
			'recipients'    => array(
				array(
					'email'      => $user->user_email,
					'first_name' => $first,
					'last_name'  => $last,
					'role'       => self::signer_role(),
				),
			),
			'tokens'        => self::prefill_tokens( $investor ),
			'metadata'      => array( 'investor_id' => $investor->investor_id ),
		);

		$res = $this->request( 'POST', '/documents', $body );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$doc_id = isset( $res['id'] ) ? $res['id'] : '';
		if ( '' === $doc_id ) {
			return new WP_Error( 'pandadoc', 'PandaDoc did not return a document id.' );
		}

		global $wpdb;
		$wpdb->insert(
			AWIVEST_DB::agreements(),
			array(
				'investor_id' => $investor->investor_id,
				'title'       => $agreement_title,
				'pandadoc_id' => $doc_id,
				'status'      => 'draft',
				'created_at'  => current_time( 'mysql' ),
			)
		);

		AWIVEST_DB::log( $investor->investor_id, 'pandadoc_send', $doc_id );

		// PandaDoc processes the new document asynchronously. Try to send now;
		// if it is not yet in "document.draft", schedule a background retry so
		// the investor reliably receives the signing email.
		$sent = $this->try_send( $doc_id );
		if ( ! $sent ) {
			wp_schedule_single_event( time() + 45, self::CRON_HOOK, array( $doc_id ) );
		}

		return $res;
	}

	/** Move a document from draft to sent. Returns true on success. */
	public function try_send( $doc_id ) {
		if ( 'document.draft' !== $this->get_status( $doc_id ) ) {
			return false;
		}
		$res = $this->send_document( $doc_id );
		if ( is_wp_error( $res ) ) {
			return false;
		}
		$this->set_local_status( $doc_id, 'sent' );
		return true;
	}

	/** Background retry (wp-cron) to auto-send once the document reaches draft. */
	public function cron_autosend( $doc_id ) {
		if ( ! self::is_configured() || '' === (string) $doc_id ) {
			return;
		}
		if ( $this->try_send( $doc_id ) ) {
			return;
		}
		$status = $this->get_status( $doc_id );
		if ( 'document.sent' === $status || 'document.completed' === $status ) {
			return;
		}
		$key = 'awivest_pd_tries_' . md5( (string) $doc_id );
		$n   = (int) get_transient( $key );
		if ( $n < 6 ) {
			set_transient( $key, $n + 1, HOUR_IN_SECONDS );
			wp_schedule_single_event( time() + 60, self::CRON_HOOK, array( $doc_id ) );
		}
	}

	public function send_document( $doc_id ) {
		return $this->request(
			'POST',
			'/documents/' . rawurlencode( $doc_id ) . '/send',
			array(
				'silent'  => false,
				'subject' => 'Your AWIVEST agreement is ready to sign',
				'message' => 'Please review and sign your agreement. Thank you.',
			)
		);
	}

	/** Current PandaDoc status (e.g. "document.draft"), or '' on error. */
	public function get_status( $doc_id ) {
		$res = $this->request( 'GET', '/documents/' . rawurlencode( $doc_id ) . '/details' );
		if ( is_wp_error( $res ) || ! isset( $res['status'] ) ) {
			return '';
		}
		return (string) $res['status'];
	}

	/** Create an embedded signing session; return its URL or WP_Error. */
	public function signing_url( $doc_id, $recipient_email ) {
		$res = $this->request(
			'POST',
			'/documents/' . rawurlencode( $doc_id ) . '/session',
			array(
				'recipient' => $recipient_email,
				'lifetime'  => 900,
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		if ( empty( $res['id'] ) ) {
			return new WP_Error( 'pandadoc', 'Could not start a signing session (the agreement may still be processing).' );
		}
		return self::APP_SIGN . $res['id'];
	}

	private function set_local_status( $doc_id, $status ) {
		global $wpdb;
		$fields = array( 'status' => $status );
		if ( 'signed' === $status ) {
			$fields['signed_at'] = current_time( 'mysql' );
		}
		$wpdb->update( AWIVEST_DB::agreements(), $fields, array( 'pandadoc_id' => $doc_id ) );
	}

	/**
	 * True when a PandaDoc document is fully signed. Checks the overall document
	 * status AND each recipient's completion flag, because immediately after an
	 * embedded signing session the recipient shows complete before the overall
	 * "document.completed" status has finished propagating.
	 */
	public function is_signed( $doc_id ) {
		$res = $this->request( 'GET', '/documents/' . rawurlencode( $doc_id ) . '/details' );
		if ( is_wp_error( $res ) ) {
			return false;
		}
		$status = isset( $res['status'] ) ? (string) $res['status'] : '';
		if ( in_array( $status, array( 'document.completed', 'document.paid' ), true ) ) {
			return true;
		}
		$recipients = ( isset( $res['recipients'] ) && is_array( $res['recipients'] ) ) ? $res['recipients'] : array();
		foreach ( $recipients as $r ) {
			if ( ! empty( $r['has_completed_signing'] ) || ! empty( $r['has_completed'] ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Pull the latest signed state for a member's onboarding packet from PandaDoc
	 * and record it on the consent row. Returns true when the packet is signed.
	 */
	public function sync_onboarding_status( $investor ) {
		$packet = AWIVEST_Consents::packet_row( $investor );
		if ( ! $packet || '' === (string) $packet->pandadoc_id ) {
			return false;
		}
		if ( 'agreed' === $packet->status ) {
			return true;
		}
		if ( $this->is_signed( $packet->pandadoc_id ) ) {
			global $wpdb;
			$wpdb->update( AWIVEST_DB::consents(), array( 'status' => 'agreed', 'decided_at' => current_time( 'mysql' ) ), array( 'id' => $packet->id ) );
			AWIVEST_DB::log( $investor->investor_id, 'onboarding_signed', $packet->pandadoc_id );
			return true;
		}
		return false;
	}

	/** Raw signed-PDF bytes from PandaDoc, or WP_Error on failure. */
	public function download_pdf( $doc_id ) {
		$resp = wp_remote_get(
			self::API_BASE . '/documents/' . rawurlencode( $doc_id ) . '/download',
			array(
				'timeout' => 30,
				'headers' => array( 'Authorization' => 'API-Key ' . self::api_key() ),
			)
		);
		if ( is_wp_error( $resp ) ) {
			return $resp;
		}
		$code = wp_remote_retrieve_response_code( $resp );
		if ( $code < 200 || $code >= 300 ) {
			return new WP_Error( 'pandadoc', 'Could not download the signed document from PandaDoc (HTTP ' . $code . ').' );
		}
		return wp_remote_retrieve_body( $resp );
	}

	/** Nonce-protected URL a member (or admin) uses to download a signed PDF. */
	public static function signed_download_url( $doc_id ) {
		return self::signed_file_url( $doc_id, 'download' );
	}

	/** Same signed PDF, opened inline in a new browser tab. */
	public static function signed_view_url( $doc_id ) {
		return self::signed_file_url( $doc_id, 'view' );
	}

	private static function signed_file_url( $doc_id, $disp ) {
		return add_query_arg(
			array(
				'awivest_pd_download' => 1,
				'pandadoc_id'         => $doc_id,
				'disp'                => ( 'view' === $disp ) ? 'view' : 'download',
				'_wpnonce'            => wp_create_nonce( 'awivest_pd_download' ),
			),
			home_url( '/' )
		);
	}

	/**
	 * Front-end: stream a signed agreement PDF to its owner (or any admin).
	 * Only serves documents recorded locally as signed, so drafts never leak.
	 */
	public function handle_signed_download() {
		if ( ! isset( $_GET['awivest_pd_download'] ) ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in to download this document.' );
		}
		$nonce = isset( $_GET['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, 'awivest_pd_download' ) ) {
			wp_die( 'Invalid or expired download link.' );
		}
		$doc_id = isset( $_GET['pandadoc_id'] ) ? sanitize_text_field( wp_unslash( $_GET['pandadoc_id'] ) ) : '';
		if ( '' === $doc_id ) {
			wp_die( 'Missing document reference.' );
		}
		if ( ! self::is_configured() ) {
			wp_die( 'Electronic signing is not configured.' );
		}

		global $wpdb;
		$is_admin = current_user_can( 'manage_options' );
		$arow     = $wpdb->get_row( $wpdb->prepare( 'SELECT investor_id, status FROM ' . AWIVEST_DB::agreements() . ' WHERE pandadoc_id = %s LIMIT 1', $doc_id ) );
		$crow     = $wpdb->get_row( $wpdb->prepare( 'SELECT investor_id, status FROM ' . AWIVEST_DB::consents() . ' WHERE pandadoc_id = %s LIMIT 1', $doc_id ) );
		$owner    = $arow ? $arow->investor_id : ( $crow ? $crow->investor_id : '' );
		if ( '' === (string) $owner ) {
			wp_die( 'Document not found.' );
		}
		if ( ! $is_admin ) {
			$inv = AWIVEST_DB::get_investor_by_user( get_current_user_id() );
			if ( ! $inv || $inv->investor_id !== $owner ) {
				wp_die( 'Access denied.' );
			}
		}
		$signed_local = ( $arow && 'signed' === $arow->status ) || ( $crow && 'agreed' === $crow->status );
		if ( ! $signed_local && ! $is_admin ) {
			wp_die( 'This agreement has not been signed yet.' );
		}

		$pdf = $this->download_pdf( $doc_id );
		if ( is_wp_error( $pdf ) ) {
			wp_die( esc_html( $pdf->get_error_message() ) );
		}
		AWIVEST_DB::log( $owner, 'signed_download', $doc_id );
		$disposition = ( isset( $_GET['disp'] ) && 'view' === $_GET['disp'] ) ? 'inline' : 'attachment';
		nocache_headers();
		header( 'Content-Type: application/pdf' );
		header( 'Content-Disposition: ' . $disposition . '; filename="awivest-signed-agreement.pdf"' );
		header( 'Content-Length: ' . strlen( $pdf ) );
		echo $pdf; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		exit;
	}

	private function request( $method, $path, $body = null ) {
		$args = array(
			'method'  => $method,
			'timeout' => 15,
			'headers' => array(
				'Authorization' => 'API-Key ' . self::api_key(),
				'Content-Type'  => 'application/json',
			),
		);
		if ( null !== $body ) {
			$args['body'] = wp_json_encode( $body );
		}
		$response = wp_remote_request( self::API_BASE . $path, $args );
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );
		$data = json_decode( $body, true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = 'PandaDoc API error (HTTP ' . $code . ').';
			if ( is_array( $data ) ) {
				if ( isset( $data['detail'] ) ) {
					$msg = is_string( $data['detail'] ) ? $data['detail'] : wp_json_encode( $data['detail'] );
				} elseif ( isset( $data['message'] ) && is_string( $data['message'] ) ) {
					$msg = $data['message'];
				} elseif ( ! empty( $data ) ) {
					$msg = wp_json_encode( $data );
				}
			} elseif ( is_string( $body ) && '' !== trim( $body ) ) {
				$msg = wp_strip_all_tags( $body );
			}
			return new WP_Error( 'pandadoc', 'PandaDoc: ' . $msg );
		}
		return is_array( $data ) ? $data : array();
	}

	/* ---------------- Webhook ---------------- */

	public function register_routes() {
		register_rest_route(
			'awivest/v1',
			'/pandadoc-webhook',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'handle_webhook' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	public function handle_webhook( $request ) {
		$secret = get_option( 'awivest_pandadoc_webhook_secret', '' );
		if ( $secret && $request->get_param( 'secret' ) !== $secret ) {
			return new WP_REST_Response( array( 'ok' => false ), 403 );
		}

		$payload = $request->get_json_params();
		$events  = is_array( $payload ) ? $payload : array();
		global $wpdb;

		foreach ( $events as $event ) {
			$data   = isset( $event['data'] ) ? $event['data'] : array();
			$doc_id = isset( $data['id'] ) ? sanitize_text_field( $data['id'] ) : '';
			$status = isset( $data['status'] ) ? sanitize_text_field( $data['status'] ) : '';
			if ( '' === $doc_id ) {
				continue;
			}

			// As soon as the document becomes a draft, auto-send it for signing.
			if ( 'document.draft' === $status ) {
				$this->try_send( $doc_id );
				continue;
			}

			$map = array(
				'document.completed' => 'signed',
				'document.sent'      => 'sent',
				'document.viewed'    => 'viewed',
				'document.declined'  => 'declined',
			);
			$new = isset( $map[ $status ] ) ? $map[ $status ] : '';
			if ( '' === $new ) {
				continue;
			}
			$fields = array( 'status' => $new );
			if ( 'signed' === $new ) {
				$fields['signed_at'] = current_time( 'mysql' );
			}
			$wpdb->update( AWIVEST_DB::agreements(), $fields, array( 'pandadoc_id' => $doc_id ) );

			// Mirror status onto an onboarding-packet consent, if this doc is one.
			$crow = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::consents() . ' WHERE pandadoc_id = %s', $doc_id ) );
			if ( $crow ) {
				if ( 'signed' === $new && 'agreed' !== $crow->status ) {
					$wpdb->update( AWIVEST_DB::consents(), array( 'status' => 'agreed', 'decided_at' => current_time( 'mysql' ) ), array( 'id' => $crow->id ) );
					AWIVEST_DB::log( $crow->investor_id, 'onboarding_signed', $doc_id );
					AWIVEST_Notifications::send( AWIVEST_Notifications::admin_email(), 'Onboarding agreements signed', array( 'Investor ' . esc_html( $crow->investor_id ) . ' e-signed the onboarding agreement packet.' ) );
				} elseif ( in_array( $new, array( 'sent', 'viewed' ), true ) && 'agreed' !== $crow->status ) {
					$wpdb->update( AWIVEST_DB::consents(), array( 'status' => 'sent' ), array( 'id' => $crow->id ) );
				}
			}

			if ( 'signed' === $new ) {
				$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::agreements() . ' WHERE pandadoc_id = %s', $doc_id ) );
				if ( $row ) {
					AWIVEST_DB::log( $row->investor_id, 'pandadoc_signed', $doc_id );
					AWIVEST_Notifications::send( AWIVEST_Notifications::admin_email(), 'Agreement signed (PandaDoc)', array( 'Investor ' . esc_html( $row->investor_id ) . ' signed: ' . esc_html( $row->title ) . '.' ) );
				}
			}
		}

		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	/* ---------------- Admin: send + Agreements page ---------------- */

	public function menu() {
		add_submenu_page( 'awivest', 'Agreements', 'Agreements', 'manage_options', 'awivest-agreements', array( $this, 'page_agreements' ) );
	}

	public function admin_handle() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		// POST: send for signing (from the Investors page).
		if ( isset( $_POST['awivest_admin_action'] ) && 'pandadoc_send' === $_POST['awivest_admin_action'] ) {
			check_admin_referer( 'awivest_pandadoc_send' );
			$investor_id = isset( $_POST['investor_id'] ) ? sanitize_text_field( wp_unslash( $_POST['investor_id'] ) ) : '';
			$title       = isset( $_POST['agreement_title'] ) ? sanitize_text_field( wp_unslash( $_POST['agreement_title'] ) ) : 'Agreement';
			$investor    = AWIVEST_DB::get_investor_by_investor_id( $investor_id );

			$notice = 'error';
			if ( $investor ) {
				$res    = $this->send_for_signing( $investor, $title );
				$notice = is_wp_error( $res ) ? rawurlencode( $res->get_error_message() ) : 'sent';
			}
			wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-investors', 'awivest_notice' => $notice ), admin_url( 'admin.php' ) ) );
			exit;
		}

		// GET: re-send / refresh from the Agreements page (nonce-protected links).
		$action = isset( $_GET['awivest_pd_action'] ) ? sanitize_key( $_GET['awivest_pd_action'] ) : '';
		if ( '' === $action ) {
			return;
		}
		$doc_id = isset( $_GET['pandadoc_id'] ) ? sanitize_text_field( wp_unslash( $_GET['pandadoc_id'] ) ) : '';
		if ( '' === $doc_id || ! check_admin_referer( 'awivest_pd_' . $action . '_' . $doc_id ) ) {
			return;
		}

		$notice = 'error';
		if ( 'resend' === $action ) {
			$res = $this->send_document( $doc_id );
			if ( ! is_wp_error( $res ) ) {
				$this->set_local_status( $doc_id, 'sent' );
				$notice = 'resent';
			} else {
				$notice = rawurlencode( $res->get_error_message() );
			}
		} elseif ( 'refresh' === $action ) {
			$status = $this->get_status( $doc_id );
			$map    = array(
				'document.completed' => 'signed',
				'document.sent'      => 'sent',
				'document.viewed'    => 'viewed',
				'document.declined'  => 'declined',
				'document.draft'     => 'draft',
			);
			if ( isset( $map[ $status ] ) ) {
				$this->set_local_status( $doc_id, $map[ $status ] );
				$notice = 'refreshed';
			}
		}
		wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-agreements', 'awivest_notice' => $notice ), admin_url( 'admin.php' ) ) );
		exit;
	}

	public function page_agreements() {
		global $wpdb;
		$rows = $wpdb->get_results( 'SELECT * FROM ' . AWIVEST_DB::agreements() . ' ORDER BY created_at DESC' );

		echo '<div class="wrap"><h1>Agreements</h1>';
		if ( ! self::is_configured() ) {
			echo '<div class="notice notice-warning"><p>PandaDoc is not configured. Add your API key and template ID under <strong>AWIVEST &gt; Settings</strong> to send agreements for e-signing.</p></div>';
		}
		if ( isset( $_GET['awivest_notice'] ) ) {
			$n   = sanitize_text_field( wp_unslash( $_GET['awivest_notice'] ) );
			$ok  = in_array( $n, array( 'resent', 'refreshed', 'sent' ), true );
			$msg = 'resent' === $n ? 'Signing email re-sent.' : ( 'refreshed' === $n ? 'Status refreshed from PandaDoc.' : ( 'sent' === $n ? 'Agreement sent.' : ( 'error' === $n ? 'Action failed.' : rawurldecode( $n ) ) ) );
			echo '<div class="notice ' . ( $ok ? 'notice-success' : 'notice-error' ) . '"><p>' . esc_html( $msg ) . '</p></div>';
		}

		echo '<p class="description">Agreements sent to investors for electronic signature. Use <strong>Re-send</strong> if a member did not receive the email, or <strong>Refresh</strong> to pull the latest status from PandaDoc.</p>';
		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><th>Investor</th><th>Title</th><th>Status</th><th>Created</th><th>Signed</th><th>Actions</th></tr></thead><tbody>';
		if ( $rows ) {
			foreach ( $rows as $r ) {
				$signed = $r->signed_at ? mysql2date( 'M j, Y', $r->signed_at ) : '-';
				echo '<tr><td>' . esc_html( $r->investor_id ) . '</td><td>' . esc_html( $r->title ) . '</td><td>' . esc_html( ucfirst( $r->status ) ) . '</td><td>' . esc_html( mysql2date( 'M j, Y', $r->created_at ) ) . '</td><td>' . esc_html( $signed ) . '</td><td>';
				if ( $r->pandadoc_id && self::is_configured() && 'signed' !== $r->status ) {
					echo '<div style="display:flex;gap:6px;flex-wrap:wrap">';
					echo '<a class="button" href="' . esc_url( $this->action_url( 'resend', $r->pandadoc_id ) ) . '">Re-send</a>';
					echo '<a class="button" href="' . esc_url( $this->action_url( 'refresh', $r->pandadoc_id ) ) . '">Refresh</a>';
					echo '</div>';
				} else {
					echo '&mdash;';
				}
				echo '</td></tr>';
			}
		} else {
			echo '<tr><td colspan="6">No agreements yet. Send one from the Investors page.</td></tr>';
		}
		echo '</tbody></table></div>';
	}

	private function action_url( $action, $doc_id ) {
		return wp_nonce_url(
			add_query_arg(
				array(
					'page'              => 'awivest-agreements',
					'awivest_pd_action' => $action,
					'pandadoc_id'       => $doc_id,
				),
				admin_url( 'admin.php' )
			),
			'awivest_pd_' . $action . '_' . $doc_id
		);
	}

	/* ---------------- Member portal: Agreements + embedded signing ---------------- */

	public function render_member_agreements( $investor ) {
		echo '<div class="awivest-card"><h2>My Agreements</h2>';
		if ( ! $investor ) {
			echo '<p>No investor profile found.</p></div>';
			return;
		}
		if ( ! self::is_configured() ) {
			echo '<p>Electronic signing is not enabled yet. Any agreements will appear here once available.</p>';
		}
		global $wpdb;
		$rows   = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::agreements() . ' WHERE investor_id = %s ORDER BY created_at DESC', $investor->investor_id ) );
		$packet = AWIVEST_Consents::packet_row( $investor );

		if ( ! $rows && ! $packet ) {
			echo '<p>You have no agreements yet. When AWIVEST sends you one to sign, it will show here.</p></div>';
			return;
		}

		echo '<table class="awivest-table"><thead><tr><th>Title</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>';

		// The onboarding agreement packet is tracked in the consents table, not the
		// agreements table, so surface it here too - including a signed-copy link.
		if ( $packet ) {
			$p_map   = array(
				'agreed'    => 'Signed',
				'sent'      => 'Awaiting signature',
				'viewed'    => 'Awaiting signature',
				'disagreed' => 'Declined',
			);
			$p_label = isset( $p_map[ $packet->status ] ) ? $p_map[ $packet->status ] : ucfirst( (string) $packet->status );
			$p_badge = ( 'agreed' === $packet->status ) ? 'signed' : ( 'disagreed' === $packet->status ? 'declined' : (string) $packet->status );
			$p_when  = ! empty( $packet->decided_at ) ? $packet->decided_at : $packet->created_at;
			echo '<tr><td>Membership onboarding agreement</td>';
			echo '<td><span class="awivest-badge ' . esc_attr( $p_badge ) . '">' . esc_html( $p_label ) . '</span></td>';
			echo '<td>' . esc_html( mysql2date( 'M j, Y', $p_when ) ) . '</td><td>';
			if ( 'agreed' === $packet->status && ! empty( $packet->pandadoc_id ) ) {
				echo '<a class="awivest-btn small" href="' . esc_url( self::signed_view_url( $packet->pandadoc_id ) ) . '" target="_blank" rel="noopener">View</a> <a class="awivest-btn small awivest-btn-outline" href="' . esc_url( self::signed_download_url( $packet->pandadoc_id ) ) . '">Download</a>';
			} else {
				echo esc_html( $p_label );
			}
			echo '</td></tr>';
		}

		if ( $rows ) {
			foreach ( $rows as $r ) {
				$when = $r->signed_at ? $r->signed_at : $r->created_at;
				echo '<tr><td>' . esc_html( $r->title ) . '</td><td><span class="awivest-badge ' . esc_attr( $r->status ) . '">' . esc_html( ucfirst( $r->status ) ) . '</span></td><td>' . esc_html( mysql2date( 'M j, Y', $when ) ) . '</td><td>';
				if ( 'signed' === $r->status ) {
					if ( $r->pandadoc_id ) {
						echo '<a class="awivest-btn small" href="' . esc_url( self::signed_view_url( $r->pandadoc_id ) ) . '" target="_blank" rel="noopener">View</a> <a class="awivest-btn small awivest-btn-outline" href="' . esc_url( self::signed_download_url( $r->pandadoc_id ) ) . '">Download</a>';
					} else {
						echo 'Completed';
					}
				} elseif ( 'declined' === $r->status ) {
					echo 'Declined';
				} elseif ( in_array( $r->status, array( 'sent', 'viewed' ), true ) && $r->pandadoc_id ) {
					$url = wp_nonce_url(
						add_query_arg( array( 'awivest_pd_sign' => $r->id ), AWIVEST_Auth::instance()->portal_url() ),
						'awivest_pd_sign_' . $r->id
					);
					echo '<a class="awivest-btn small" href="' . esc_url( $url ) . '" target="_blank" rel="noopener">Sign now</a>';
				} else {
					echo 'Preparing...';
				}
				echo '</td></tr>';
			}
		}
		echo '</tbody></table>';
		echo '<p class="awivest-muted">Signed agreements show View and Download buttons. If a status looks out of date, reload this page.</p>';
		echo '</div>';
	}

	/**
	 * Front-end: a logged-in investor opening ?awivest_pd_sign=<id> is redirected
	 * into an embedded PandaDoc signing session for their own agreement.
	 */
	public function maybe_handle_member_sign() {
		if ( is_admin() || ! isset( $_GET['awivest_pd_sign'] ) ) {
			return;
		}
		$id = absint( $_GET['awivest_pd_sign'] );
		if ( ! $id || ! is_user_logged_in() ) {
			return;
		}
		if ( ! isset( $_GET['_wpnonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ), 'awivest_pd_sign_' . $id ) ) {
			return;
		}
		$inv = AWIVEST_DB::current_investor();
		if ( ! $inv ) {
			return;
		}
		global $wpdb;
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::agreements() . ' WHERE id = %d', $id ) );
		if ( ! $row || $row->investor_id !== $inv->investor_id || '' === (string) $row->pandadoc_id ) {
			return;
		}
		$user = wp_get_current_user();
		$back = add_query_arg( 'view', 'agreements', AWIVEST_Auth::instance()->portal_url() );
		$url  = $this->signing_url( $row->pandadoc_id, $user->user_email );
		if ( is_wp_error( $url ) ) {
			AWIVEST_Auth::go( $back );
			exit;
		}
		// External PandaDoc signing URL (app.pandadoc.com).
		AWIVEST_Auth::go( $url, false );
		exit;
	}

	/* ---------------- Onboarding agreement packet (single sign-once) ---------------- */

	/**
	 * Create the onboarding agreement packet from the configured PandaDoc
	 * template, record it as the member's packet consent, and auto-send it so
	 * the member receives the signing email. Returns the API response or WP_Error.
	 */
	public function send_onboarding_packet( $investor ) {
		if ( ! self::is_configured() ) {
			return new WP_Error( 'pandadoc', 'PandaDoc API key is not set. Add it in AWIVEST > Settings.' );
		}
		$template = self::onboarding_template_id();
		if ( '' === $template ) {
			return new WP_Error( 'pandadoc', 'Onboarding packet template is not set. Add it in AWIVEST > Settings.' );
		}
		$user = get_user_by( 'id', $investor->wp_user_id );
		if ( ! $user ) {
			return new WP_Error( 'pandadoc', 'Investor user account not found.' );
		}

		$name_parts = explode( ' ', trim( $investor->full_name ), 2 );
		$first      = $name_parts[0];
		$last       = isset( $name_parts[1] ) ? $name_parts[1] : '.';

		$body = array(
			'name'          => 'Onboarding Agreements - ' . $investor->investor_id,
			'template_uuid' => $template,
			'recipients'    => array(
				array(
					'email'      => $user->user_email,
					'first_name' => $first,
					'last_name'  => $last,
					'role'       => self::signer_role(),
				),
			),
			'tokens'        => self::prefill_tokens( $investor ),
			'metadata'      => array(
				'investor_id' => $investor->investor_id,
				'kind'        => 'onboarding',
			),
		);

		$res = $this->request( 'POST', '/documents', $body );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$doc_id = isset( $res['id'] ) ? $res['id'] : '';
		if ( '' === $doc_id ) {
			return new WP_Error( 'pandadoc', 'PandaDoc did not return a document id.' );
		}

		AWIVEST_Consents::set_packet(
			$investor->investor_id,
			array(
				'status'      => 'sent',
				'pandadoc_id' => $doc_id,
				'decided_at'  => null,
			)
		);
		AWIVEST_DB::log( $investor->investor_id, 'onboarding_send', $doc_id );

		// PandaDoc processes the new document asynchronously. Try to send now;
		// if it is not yet drafted, schedule a background retry.
		if ( ! $this->try_send( $doc_id ) ) {
			wp_schedule_single_event( time() + 45, self::CRON_HOOK, array( $doc_id ) );
		}

		return $res;
	}

	/**
	 * Front-end: a logged-in investor opening ?awivest_onboard_sign=1 is taken
	 * into an embedded signing session for their onboarding packet, while
	 * ?awivest_onboard_refresh=1 pulls the latest status from PandaDoc.
	 */
	public function maybe_handle_onboarding() {
		if ( is_admin() ) {
			return;
		}
		$do_sign    = isset( $_GET['awivest_onboard_sign'] );
		$do_refresh = isset( $_GET['awivest_onboard_refresh'] );
		if ( ! $do_sign && ! $do_refresh ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			return;
		}
		$nonce  = isset( $_GET['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ) : '';
		$action = $do_sign ? 'awivest_onboard_sign' : 'awivest_onboard_refresh';
		if ( ! wp_verify_nonce( $nonce, $action ) ) {
			return;
		}
		$inv = AWIVEST_DB::current_investor();
		if ( ! $inv ) {
			return;
		}
		$back   = AWIVEST_Auth::instance()->portal_url();
		$packet = AWIVEST_Consents::packet_row( $inv );
		if ( ! $packet || '' === (string) $packet->pandadoc_id ) {
			AWIVEST_Auth::instance()->flash( 'error', array( 'Please click "Prepare and e-sign agreements" first.' ) );
			AWIVEST_Auth::go( $back );
			exit;
		}

		if ( $do_refresh ) {
			if ( $this->sync_onboarding_status( $inv ) ) {
				AWIVEST_Auth::instance()->flash( 'success', array( 'Thank you. Your agreements are signed.' ) );
			} else {
				AWIVEST_Auth::instance()->flash( 'error', array( 'We have not received your completed signature from PandaDoc yet. If you just signed, please wait about 30 seconds and click refresh again. If this keeps happening, set your PandaDoc webhook under AWIVEST > Settings.' ) );
			}
			AWIVEST_Auth::go( $back );
			exit;
		}

		// Ensure the document is sent before starting an embedded signing session.
		$this->try_send( $packet->pandadoc_id );
		$user = wp_get_current_user();
		$url  = $this->signing_url( $packet->pandadoc_id, $user->user_email );
		if ( is_wp_error( $url ) ) {
			AWIVEST_Auth::instance()->flash( 'error', array( $url->get_error_message() ) );
			AWIVEST_Auth::go( $back );
			exit;
		}
		AWIVEST_Auth::go( $url, false );
		exit;
	}
}
