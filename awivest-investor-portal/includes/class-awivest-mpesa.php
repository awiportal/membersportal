<?php
/**
 * Phase 4: M-Pesa (Safaricom Daraja) STK-push contributions.
 *
 * Investors trigger an STK push from the portal; the callback REST endpoint
 * reconciles the transaction. All credentials live in AWIVEST > Settings.
 * Falls back to a clear notice when not configured.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Mpesa {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'handle' ) );
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/* ---------------- Config ---------------- */

	public static function is_configured() {
		foreach ( array( 'consumer_key', 'consumer_secret', 'shortcode', 'passkey' ) as $k ) {
			if ( '' === trim( (string) get_option( 'awivest_mpesa_' . $k, '' ) ) ) {
				return false;
			}
		}
		return true;
	}

	private function base_url() {
		$env = get_option( 'awivest_mpesa_env', 'sandbox' );
		return 'production' === $env ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
	}

	private function callback_url() {
		return rest_url( 'awivest/v1/mpesa-callback' );
	}

	/**
	 * Normalise a Kenyan phone number to 2547XXXXXXXX / 2541XXXXXXXX.
	 */
	public static function normalize_phone( $phone ) {
		$digits = preg_replace( '/\D+/', '', $phone );
		if ( '' === $digits ) {
			return '';
		}
		if ( strpos( $digits, '0' ) === 0 ) {
			$digits = '254' . substr( $digits, 1 );
		} elseif ( strpos( $digits, '7' ) === 0 || strpos( $digits, '1' ) === 0 ) {
			$digits = '254' . $digits;
		} elseif ( strpos( $digits, '254' ) !== 0 ) {
			$digits = '254' . ltrim( $digits, '254' );
		}
		return $digits;
	}

	/* ---------------- API ---------------- */

	private function get_token() {
		$url  = $this->base_url() . '/oauth/v1/generate?grant_type=client_credentials';
		$auth = base64_encode( get_option( 'awivest_mpesa_consumer_key' ) . ':' . get_option( 'awivest_mpesa_consumer_secret' ) );
		$res  = wp_remote_get(
			$url,
			array(
				'timeout' => 20,
				'headers' => array( 'Authorization' => 'Basic ' . $auth ),
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$body = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( empty( $body['access_token'] ) ) {
			return new WP_Error( 'mpesa', 'Could not obtain M-Pesa access token. Check your credentials.' );
		}
		return $body['access_token'];
	}

	/**
	 * Initiate an STK push. Returns array|WP_Error.
	 */
	public function stk_push( $investor, $amount, $phone ) {
		if ( ! self::is_configured() ) {
			return new WP_Error( 'mpesa', 'M-Pesa is not configured yet. Please contact the administrator.' );
		}
		$amount = (int) round( $amount );
		if ( $amount < 1 ) {
			return new WP_Error( 'mpesa', 'Enter a valid amount.' );
		}
		$msisdn = self::normalize_phone( $phone );
		if ( strlen( $msisdn ) < 12 ) {
			return new WP_Error( 'mpesa', 'Enter a valid Safaricom phone number.' );
		}

		$token = $this->get_token();
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$shortcode = get_option( 'awivest_mpesa_shortcode' );
		$passkey   = get_option( 'awivest_mpesa_passkey' );
		$timestamp = gmdate( 'YmdHis', current_time( 'timestamp' ) );
		$password  = base64_encode( $shortcode . $passkey . $timestamp );
		$account   = $investor ? $investor->investor_id : 'AWIVEST';

		$payload = array(
			'BusinessShortCode' => $shortcode,
			'Password'          => $password,
			'Timestamp'         => $timestamp,
			'TransactionType'   => 'CustomerPayBillOnline',
			'Amount'            => $amount,
			'PartyA'            => $msisdn,
			'PartyB'            => $shortcode,
			'PhoneNumber'       => $msisdn,
			'CallBackURL'       => $this->callback_url(),
			'AccountReference'  => substr( $account, 0, 12 ),
			'TransactionDesc'   => 'AWIVEST contribution',
		);

		$res = wp_remote_post(
			$this->base_url() . '/mpesa/stkpush/v1/processrequest',
			array(
				'timeout' => 25,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( $payload ),
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$body = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( empty( $body['ResponseCode'] ) || '0' !== (string) $body['ResponseCode'] ) {
			$msg = isset( $body['errorMessage'] ) ? $body['errorMessage'] : ( isset( $body['ResponseDescription'] ) ? $body['ResponseDescription'] : 'M-Pesa request failed.' );
			return new WP_Error( 'mpesa', $msg );
		}

		global $wpdb;
		$now = current_time( 'mysql' );
		$wpdb->insert(
			AWIVEST_DB::mpesa(),
			array(
				'investor_id'         => $account,
				'phone'               => $msisdn,
				'amount'              => $amount,
				'account_ref'         => $account,
				'merchant_request_id' => isset( $body['MerchantRequestID'] ) ? sanitize_text_field( $body['MerchantRequestID'] ) : '',
				'checkout_request_id' => isset( $body['CheckoutRequestID'] ) ? sanitize_text_field( $body['CheckoutRequestID'] ) : '',
				'status'              => 'pending',
				'created_at'          => $now,
				'updated_at'          => $now,
			)
		);
		AWIVEST_DB::log( $account, 'mpesa_stk', 'KES ' . $amount );
		return $body;
	}

	/* ---------------- Front-end ---------------- */

	public function handle() {
		if ( empty( $_POST['awivest_action'] ) || 'mpesa_pay' !== $_POST['awivest_action'] ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in.' );
		}
		if ( ! isset( $_POST['awivest_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['awivest_nonce'] ) ), 'awivest_mpesa' ) ) {
			wp_die( 'Security check failed.' );
		}
		$investor = AWIVEST_DB::current_investor();
		$amount   = isset( $_POST['amount'] ) ? floatval( $_POST['amount'] ) : 0;
		$phone    = isset( $_POST['phone'] ) ? sanitize_text_field( wp_unslash( $_POST['phone'] ) ) : '';

		$res = $this->stk_push( $investor, $amount, $phone );
		if ( is_wp_error( $res ) ) {
			AWIVEST_Auth::instance()->flash( 'error', array( $res->get_error_message() ) );
		} else {
			AWIVEST_Auth::instance()->flash( 'success', array( 'A payment prompt has been sent to your phone. Enter your M-Pesa PIN to complete the contribution.' ) );
		}
		wp_safe_redirect( add_query_arg( 'view', 'payments', AWIVEST_Auth::instance()->portal_url() ) );
		exit;
	}

	public function render_view() {
		$investor = AWIVEST_DB::current_investor();
		echo '<div class="awivest-card"><h2>Make a Contribution (M-Pesa)</h2>';
		if ( ! self::is_configured() ) {
			echo '<p class="awivest-hint">M-Pesa payments are not enabled yet. Please check back soon.</p>';
		} else {
			echo '<form method="post" class="awivest-form">';
			wp_nonce_field( 'awivest_mpesa', 'awivest_nonce' );
			echo '<input type="hidden" name="awivest_action" value="mpesa_pay">';
			echo '<label>Amount (KES)<input type="number" step="1" min="1" name="amount" required></label>';
			$default_phone = $investor ? $investor->phone : '';
			echo '<label>Safaricom Phone (07.. or 2547..)<input type="tel" name="phone" value="' . esc_attr( $default_phone ) . '" required></label>';
			echo '<button class="awivest-btn" type="submit">Send STK Push</button>';
			echo '</form>';
		}
		echo '</div>';

		if ( $investor ) {
			global $wpdb;
			$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::mpesa() . ' WHERE investor_id = %s ORDER BY created_at DESC LIMIT 50', $investor->investor_id ) );
			echo '<div class="awivest-card"><h2>Contribution History</h2>';
			echo '<table class="awivest-table"><thead><tr><th>Date</th><th>Amount (KES)</th><th>Receipt</th><th>Status</th></tr></thead><tbody>';
			if ( $rows ) {
				foreach ( $rows as $r ) {
					echo '<tr><td>' . esc_html( mysql2date( 'M j, Y H:i', $r->created_at ) ) . '</td><td>' . esc_html( number_format( (float) $r->amount, 2 ) ) . '</td><td>' . esc_html( $r->mpesa_receipt ) . '</td><td><span class="awivest-badge ' . esc_attr( $r->status ) . '">' . esc_html( ucfirst( $r->status ) ) . '</span></td></tr>';
				}
			} else {
				echo '<tr><td colspan="4">No contributions yet.</td></tr>';
			}
			echo '</tbody></table></div>';
		}
	}

	/* ---------------- Callback ---------------- */

	public function register_routes() {
		register_rest_route(
			'awivest/v1',
			'/mpesa-callback',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'handle_callback' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	public function handle_callback( $request ) {
		$payload = $request->get_json_params();
		$stk     = isset( $payload['Body']['stkCallback'] ) ? $payload['Body']['stkCallback'] : null;
		if ( ! $stk ) {
			return new WP_REST_Response( array( 'ResultCode' => 0, 'ResultDesc' => 'Ignored' ), 200 );
		}

		$checkout = isset( $stk['CheckoutRequestID'] ) ? sanitize_text_field( $stk['CheckoutRequestID'] ) : '';
		$code     = isset( $stk['ResultCode'] ) ? (int) $stk['ResultCode'] : 1;
		$desc     = isset( $stk['ResultDesc'] ) ? sanitize_text_field( $stk['ResultDesc'] ) : '';

		$receipt = '';
		if ( 0 === $code && isset( $stk['CallbackMetadata']['Item'] ) && is_array( $stk['CallbackMetadata']['Item'] ) ) {
			foreach ( $stk['CallbackMetadata']['Item'] as $item ) {
				if ( isset( $item['Name'] ) && 'MpesaReceiptNumber' === $item['Name'] && isset( $item['Value'] ) ) {
					$receipt = sanitize_text_field( $item['Value'] );
				}
			}
		}

		global $wpdb;
		$tx = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::mpesa() . ' WHERE checkout_request_id = %s', $checkout ) );
		if ( $tx ) {
			$wpdb->update(
				AWIVEST_DB::mpesa(),
				array(
					'status'        => 0 === $code ? 'success' : 'failed',
					'mpesa_receipt' => $receipt,
					'result_desc'   => $desc,
					'updated_at'    => current_time( 'mysql' ),
				),
				array( 'id' => $tx->id )
			);
			if ( 0 === $code ) {
				AWIVEST_DB::log( $tx->investor_id, 'mpesa_success', $receipt );
				$inv = AWIVEST_DB::get_investor_by_investor_id( $tx->investor_id );
				if ( $inv ) {
					$user = get_user_by( 'id', $inv->wp_user_id );
					if ( $user ) {
						AWIVEST_Notifications::send( $user->user_email, 'Contribution received', array( 'We have received your contribution of KES ' . esc_html( number_format( (float) $tx->amount, 2 ) ) . '. Receipt: ' . esc_html( $receipt ) . '.' ) );
					}
				}
			}
		}

		return new WP_REST_Response( array( 'ResultCode' => 0, 'ResultDesc' => 'Accepted' ), 200 );
	}
}
