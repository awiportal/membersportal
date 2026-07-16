<?php
/**
 * Anti-bot protection for the public sign-up form (2.5.0).
 *
 * Defence in depth so automated tools cannot mass-create accounts:
 *   1. Honeypot field  - a hidden field humans never fill; bots do.
 *   2. Timing check    - a signed timestamp; forms submitted implausibly fast
 *                        (or replayed after an hour) are rejected.
 *   3. Per-IP throttle - caps sign-up attempts per connection per hour.
 *   4. CAPTCHA         - optional Cloudflare Turnstile or Google reCAPTCHA v2,
 *                        enabled from Settings once site/secret keys are set.
 *
 * The honeypot, timing check and throttle always run (no configuration needed).
 * The CAPTCHA is an added layer that turns on when keys are provided.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Security {

	const MAX_PER_IP_PER_HOUR = 10;
	const MIN_SECONDS         = 3;

	/** Configured CAPTCHA provider: 'turnstile', 'recaptcha', or 'none'. */
	public static function provider() {
		$p = sanitize_key( (string) get_option( 'awivest_captcha_provider', 'none' ) );
		return in_array( $p, array( 'turnstile', 'recaptcha' ), true ) ? $p : 'none';
	}

	public static function site_key() {
		return trim( (string) get_option( 'awivest_captcha_site_key', '' ) );
	}

	public static function secret_key() {
		return trim( (string) get_option( 'awivest_captcha_secret_key', '' ) );
	}

	/** True when a CAPTCHA provider is fully configured (provider + both keys). */
	public static function captcha_active() {
		return 'none' !== self::provider() && '' !== self::site_key() && '' !== self::secret_key();
	}

	private static function sign_ts( $ts ) {
		return hash_hmac( 'sha256', 'awivest_reg|' . $ts, wp_salt( 'auth' ) );
	}

	private static function client_ip() {
		return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	}

	/**
	 * Output the hidden anti-bot fields and (if configured) the CAPTCHA widget.
	 * Call this inside the registration <form>.
	 */
	public static function render_challenge() {
		$ts = time();
		echo '<div style="position:absolute;left:-9999px;top:-9999px" aria-hidden="true">';
		echo '<label>Leave this field empty <input type="text" name="awivest_hp" value="" tabindex="-1" autocomplete="off"></label>';
		echo '</div>';
		echo '<input type="hidden" name="awivest_ts" value="' . esc_attr( $ts ) . '">';
		echo '<input type="hidden" name="awivest_ts_sig" value="' . esc_attr( self::sign_ts( $ts ) ) . '">';

		if ( ! self::captcha_active() ) {
			return;
		}
		$site = self::site_key();
		if ( 'turnstile' === self::provider() ) {
			echo '<div class="cf-turnstile" data-sitekey="' . esc_attr( $site ) . '" style="margin:10px 0"></div>';
			echo '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>';
		} else {
			echo '<div class="g-recaptcha" data-sitekey="' . esc_attr( $site ) . '" style="margin:10px 0"></div>';
			echo '<script src="https://www.google.com/recaptcha/api.js" async defer></script>';
		}
	}

	/**
	 * Verify a registration submission. Returns an array of human-readable error
	 * messages; an empty array means the submission passed all checks.
	 */
	public static function verify_registration() {
		// Honeypot: a real browser leaves this empty.
		if ( ! empty( $_POST['awivest_hp'] ) ) {
			return array( 'Your submission could not be processed. Please try again.' );
		}

		$errors = array();

		// Timing: signed timestamp, not too fast, not stale.
		$ts  = isset( $_POST['awivest_ts'] ) ? absint( $_POST['awivest_ts'] ) : 0;
		$sig = isset( $_POST['awivest_ts_sig'] ) ? sanitize_text_field( wp_unslash( $_POST['awivest_ts_sig'] ) ) : '';
		if ( ! $ts || ! hash_equals( self::sign_ts( $ts ), $sig ) ) {
			$errors[] = 'Please reload the page and try again.';
		} else {
			$elapsed = time() - $ts;
			if ( $elapsed < self::MIN_SECONDS ) {
				$errors[] = 'Your form was submitted too quickly. Please wait a moment and try again.';
			} elseif ( $elapsed > HOUR_IN_SECONDS ) {
				$errors[] = 'This form has expired. Please reload the page and try again.';
			}
		}

		// Per-IP throttle.
		$ip = self::client_ip();
		if ( '' !== $ip ) {
			$key = 'awivest_reg_ip_' . md5( $ip );
			$n   = (int) get_transient( $key );
			if ( $n >= self::MAX_PER_IP_PER_HOUR ) {
				$errors[] = 'Too many sign-up attempts from your connection. Please try again later.';
			} else {
				set_transient( $key, $n + 1, HOUR_IN_SECONDS );
			}
		}

		// CAPTCHA (only when configured).
		$captcha_error = self::verify_captcha();
		if ( '' !== $captcha_error ) {
			$errors[] = $captcha_error;
		}

		return $errors;
	}

	private static function verify_captcha() {
		if ( ! self::captcha_active() ) {
			return '';
		}
		if ( 'turnstile' === self::provider() ) {
			$token = isset( $_POST['cf-turnstile-response'] ) ? sanitize_text_field( wp_unslash( $_POST['cf-turnstile-response'] ) ) : '';
			$url   = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
		} else {
			$token = isset( $_POST['g-recaptcha-response'] ) ? sanitize_text_field( wp_unslash( $_POST['g-recaptcha-response'] ) ) : '';
			$url   = 'https://www.google.com/recaptcha/api/siteverify';
		}
		if ( '' === $token ) {
			return 'Please complete the human-verification check.';
		}

		$resp = wp_remote_post(
			$url,
			array(
				'timeout' => 15,
				'body'    => array(
					'secret'   => self::secret_key(),
					'response' => $token,
					'remoteip' => self::client_ip(),
				),
			)
		);
		if ( is_wp_error( $resp ) ) {
			// Fail open on a network error so a provider outage never blocks real users.
			return '';
		}
		$data = json_decode( wp_remote_retrieve_body( $resp ), true );
		if ( is_array( $data ) && ! empty( $data['success'] ) ) {
			return '';
		}
		return 'Human verification failed. Please try again.';
	}
}
