<?php
/**
 * Onboarding agreements (2.2.5) - e-sign-only single packet.
 *
 * Approved members must electronically sign one combined onboarding agreement
 * packet (built once as a PandaDoc template) before they can use the rest of the
 * portal. The portal shows the agreement document(s) to read, then a single
 * "Prepare & e-sign" action that creates and sends the PandaDoc packet and opens
 * an embedded signing session. A member may instead Disagree, which sets their
 * account to inactive (deactivated) and alerts an administrator.
 *
 * The packet is tracked as one consent row per member (document_id = 0) that
 * carries the PandaDoc document id and its status (sent -> agreed, or disagreed).
 * The gate only applies when e-signing is actually available (PandaDoc API key +
 * onboarding template set), so a missing configuration never locks members out.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Consents {

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

	/** True when the onboarding e-sign packet can be used (PandaDoc + template set). */
	public static function esign_available() {
		return AWIVEST_PandaDoc::is_configured() && '' !== AWIVEST_PandaDoc::onboarding_template_id();
	}

	/** All onboarding-agreement documents (shown to members to read). */
	public static function agreement_docs() {
		global $wpdb;
		return $wpdb->get_results(
			"SELECT * FROM " . AWIVEST_DB::documents() . " WHERE document_type = 'onboarding_agreement' ORDER BY created_at ASC"
		);
	}

	/** The single packet consent row for this investor (document_id = 0), or null. */
	public static function packet_row( $investor ) {
		if ( ! $investor ) {
			return null;
		}
		global $wpdb;
		return $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM " . AWIVEST_DB::consents() . " WHERE investor_id = %s AND document_id = 0 ORDER BY id DESC LIMIT 1",
				$investor->investor_id
			)
		);
	}

	/**
	 * A member is gated until they complete the packet. The gate only applies
	 * when e-signing is available, so a missing PandaDoc/template never blocks
	 * the portal.
	 */
	public static function has_pending( $investor ) {
		if ( ! $investor || ! self::esign_available() ) {
			return false;
		}
		$row = self::packet_row( $investor );
		return ! ( $row && 'agreed' === $row->status );
	}

	/** Insert or update the packet consent row (document_id = 0). Returns its id. */
	public static function set_packet( $investor_id, $fields ) {
		global $wpdb;
		$existing = $wpdb->get_row( $wpdb->prepare( "SELECT id FROM " . AWIVEST_DB::consents() . " WHERE investor_id = %s AND document_id = 0", $investor_id ) );
		if ( $existing ) {
			$wpdb->update( AWIVEST_DB::consents(), $fields, array( 'id' => $existing->id ) );
			return (int) $existing->id;
		}
		$fields['investor_id'] = $investor_id;
		$fields['document_id'] = 0;
		if ( empty( $fields['created_at'] ) ) {
			$fields['created_at'] = current_time( 'mysql' );
		}
		$wpdb->insert( AWIVEST_DB::consents(), $fields );
		return (int) $wpdb->insert_id;
	}

	/** The required review-and-sign step shown in the portal. */
	public function render_review( $investor ) {
		$docs   = self::agreement_docs();
		$packet = self::packet_row( $investor );
		$status = $packet ? $packet->status : '';

		echo '<div class="awivest-card">';
		echo '<h2>Membership Agreements</h2>';
		echo '<p>Welcome. Before you can access the rest of the portal, please review the AWIVEST agreement(s) below and <strong>electronically sign</strong> them. You may instead <strong>Disagree</strong>, which will set your account to inactive so an administrator can follow up with you.</p>';

		if ( $docs ) {
			echo '<p><strong>Documents to review:</strong></p><ul class="awivest-doc-list">';
			foreach ( $docs as $d ) {
				echo '<li><a href="' . esc_url( AWIVEST_Documents::download_url( 'document', $d->id ) ) . '" target="_blank" rel="noopener">' . esc_html( $d->title ) . '</a></li>';
			}
			echo '</ul>';
		}

		if ( ! self::esign_available() ) {
			echo '<p class="awivest-muted">Electronic signing is not enabled yet. Please contact AWIVEST.</p></div>';
			return;
		}

		if ( 'sent' === $status && ! empty( $packet->pandadoc_id ) ) {
			$sign_url = wp_nonce_url( add_query_arg( 'awivest_onboard_sign', '1', AWIVEST_Auth::instance()->portal_url() ), 'awivest_onboard_sign' );
			$refresh  = wp_nonce_url( add_query_arg( 'awivest_onboard_refresh', '1', AWIVEST_Auth::instance()->portal_url() ), 'awivest_onboard_refresh' );
			echo '<p>Your agreement packet is ready. We have also emailed you a secure signing link.</p>';
			echo '<p><a class="awivest-btn" href="' . esc_url( $sign_url ) . '" target="_blank" rel="noopener">Open &amp; e-sign now</a> ';
			echo '<a class="awivest-btn small" href="' . esc_url( $refresh ) . '">I have signed - refresh status</a></p>';
		} else {
			echo '<p>Click below to prepare and electronically sign all the agreements in one packet.</p>';
			echo '<form method="post">';
			echo '<input type="hidden" name="awivest_action" value="onboarding_esign_start">';
			wp_nonce_field( 'awivest_onboarding_start', 'awivest_nonce' );
			echo '<button type="submit" class="awivest-btn">Prepare &amp; e-sign agreements</button>';
			echo '</form>';
		}

		// Disagree is always available.
		echo '<form method="post" class="awivest-disagree" onsubmit="return confirm(\'Disagreeing will set your account to inactive. Continue?\');">';
		echo '<input type="hidden" name="awivest_action" value="onboarding_disagree">';
		wp_nonce_field( 'awivest_onboarding_disagree', 'awivest_nonce' );
		echo '<p><button type="submit" class="awivest-btn awivest-btn-danger">Disagree</button></p>';
		echo '</form>';

		echo '</div>';
	}

	/** Handle the two member POST actions: start e-sign, and disagree. */
	public function handle_post() {
		$action = isset( $_POST['awivest_action'] ) ? sanitize_key( $_POST['awivest_action'] ) : '';
		if ( 'onboarding_esign_start' !== $action && 'onboarding_disagree' !== $action ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in.' );
		}
		$nonce    = isset( $_POST['awivest_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['awivest_nonce'] ) ) : '';
		$investor = AWIVEST_DB::current_investor();
		if ( ! $investor ) {
			wp_die( 'Investor profile not found.' );
		}
		$back = AWIVEST_Auth::instance()->portal_url();

		if ( 'onboarding_disagree' === $action ) {
			if ( ! wp_verify_nonce( $nonce, 'awivest_onboarding_disagree' ) ) {
				wp_die( 'Security check failed.' );
			}
			self::set_packet( $investor->investor_id, array( 'status' => 'disagreed', 'decided_at' => current_time( 'mysql' ) ) );
			global $wpdb;
			$wpdb->update( AWIVEST_DB::investors(), array( 'status' => 'deactivated' ), array( 'investor_id' => $investor->investor_id ) );
			AWIVEST_DB::log( $investor->investor_id, 'onboarding_disagree', '' );
			AWIVEST_Notifications::send( AWIVEST_Notifications::admin_email(), 'Investor disagreed with onboarding agreements', array( 'Investor ' . esc_html( $investor->investor_id ) . ' disagreed with the onboarding agreements. Their account has been set to inactive.' ) );
			AWIVEST_Auth::instance()->flash( 'error', array( 'You disagreed with the onboarding agreements. Your account is now inactive. Please contact AWIVEST if this was a mistake.' ) );
			AWIVEST_Auth::go( $back );
			exit;
		}

		// onboarding_esign_start
		if ( ! wp_verify_nonce( $nonce, 'awivest_onboarding_start' ) ) {
			wp_die( 'Security check failed.' );
		}
		if ( ! self::esign_available() ) {
			AWIVEST_Auth::instance()->flash( 'error', array( 'Electronic signing is not enabled yet. Please contact AWIVEST.' ) );
			AWIVEST_Auth::go( $back );
			exit;
		}
		$res = AWIVEST_PandaDoc::instance()->send_onboarding_packet( $investor );
		if ( is_wp_error( $res ) ) {
			AWIVEST_Auth::instance()->flash( 'error', array( $res->get_error_message() ) );
		} else {
			AWIVEST_Auth::instance()->flash( 'success', array( 'Your agreement packet has been prepared and emailed to you. Click "Open and e-sign now" to sign it here.' ) );
		}
		AWIVEST_Auth::go( $back );
		exit;
	}
}
