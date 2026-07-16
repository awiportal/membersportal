<?php
/**
 * Email notifications via wp_mail (works with any SMTP plugin on GoDaddy).
 * Also sets a branded "From" name/address so mail is not sent as "WordPress".
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Notifications {

	/**
	 * Register mail "From" filters. Called once on plugins_loaded.
	 */
	public static function boot() {
		add_filter( 'wp_mail_from_name', array( __CLASS__, 'filter_from_name' ), 99 );
		add_filter( 'wp_mail_from', array( __CLASS__, 'filter_from_email' ), 99 );
	}

	/** Configured sender name (defaults to AWIVEST). */
	public static function from_name() {
		$name = trim( (string) get_option( 'awivest_from_name', '' ) );
		return ( '' !== $name ) ? $name : 'AWIVEST';
	}

	/** Configured sender address (defaults to noreply@<site domain>). */
	public static function from_email() {
		$email = trim( (string) get_option( 'awivest_from_email', '' ) );
		if ( $email && is_email( $email ) ) {
			return $email;
		}
		$host = wp_parse_url( home_url(), PHP_URL_HOST );
		$host = preg_replace( '/^www\./i', '', (string) $host );
		return $host ? 'noreply@' . $host : 'noreply@awivest.com';
	}

	/**
	 * Replace only the WordPress default name, so we never fight an SMTP plugin
	 * or another integration that has already set a proper sender name.
	 */
	public static function filter_from_name( $name ) {
		if ( '' === trim( (string) $name ) || 'WordPress' === $name ) {
			return self::from_name();
		}
		return $name;
	}

	/** Replace only the default wordpress@ address. */
	public static function filter_from_email( $email ) {
		if ( 0 === strpos( (string) $email, 'wordpress@' ) ) {
			return self::from_email();
		}
		return $email;
	}

	/**
	 * Send a simple branded HTML email.
	 *
	 * @param string       $to      Recipient address.
	 * @param string       $subject Subject (site name is prefixed automatically).
	 * @param string|array $lines   One or more paragraph strings.
	 */
	public static function send( $to, $subject, $lines ) {
		if ( ! is_email( $to ) ) {
			return false;
		}
		$site  = get_bloginfo( 'name' );
		$brand = self::from_name();
		$body  = '<p>Hello,</p>';
		foreach ( (array) $lines as $line ) {
			if ( '' === trim( (string) $line ) ) {
				continue;
			}
			$body .= '<p>' . wp_kses_post( $line ) . '</p>';
		}
		$body   .= '<p>Regards,<br>' . esc_html( $brand ) . ' Investor Relations</p>';
		$headers = array( 'Content-Type: text/html; charset=UTF-8' );
		$reply   = self::admin_email();
		if ( is_email( $reply ) ) {
			$headers[] = 'Reply-To: ' . $brand . ' <' . $reply . '>';
		}
		return wp_mail( $to, '[' . $site . '] ' . $subject, $body, $headers );
	}

	public static function admin_email() {
		return get_option( 'awivest_admin_email', get_option( 'admin_email' ) );
	}
}
