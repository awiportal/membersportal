<?php
/**
 * Database helpers: table names, lookups, Investor ID generation, audit logging.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_DB {

	public static function investors() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_investors';
	}

	public static function kyc() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_kyc';
	}

	public static function documents() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_documents';
	}

	public static function agreements() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_agreements';
	}

	public static function logs() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_audit_log';
	}

	/* ---- Phase 2-4 tables ---- */

	public static function forms() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_form_submissions';
	}

	public static function opportunities() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_opportunities';
	}

	public static function interests() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_interests';
	}

	public static function mpesa() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_mpesa_tx';
	}

	public static function dividends() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_dividends';
	}

	public static function welfare() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_welfare';
	}

	public static function welfare_claims() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_welfare_claims';
	}

	public static function form_defs() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_form_defs';
	}

	public static function consents() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_consents';
	}

	/**
	 * Investor row for a WordPress user id.
	 */
	public static function get_investor_by_user( $user_id ) {
		global $wpdb;
		$t = self::investors();
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t} WHERE wp_user_id = %d", $user_id ) );
	}

	/**
	 * Investor row by the human-facing Investor ID (e.g. AWV-2026-0001).
	 */
	public static function get_investor_by_investor_id( $investor_id ) {
		global $wpdb;
		$t = self::investors();
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t} WHERE investor_id = %s", $investor_id ) );
	}

	/**
	 * Convenience: the investor row for the currently logged-in user (or null).
	 */
	public static function current_investor() {
		if ( ! is_user_logged_in() ) {
			return null;
		}
		return self::get_investor_by_user( get_current_user_id() );
	}

	/**
	 * Generate a unique, sequential Investor ID like AWV-2026-0001.
	 */
	public static function generate_investor_id() {
		global $wpdb;
		$t     = self::investors();
		$year  = gmdate( 'Y' );
		$count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$t}" );
		do {
			$count++;
			$candidate = sprintf( 'AWV-%s-%04d', $year, $count );
			$exists    = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$t} WHERE investor_id = %s", $candidate ) );
		} while ( $exists );
		return $candidate;
	}

	/**
	 * Append an audit-log entry.
	 */
	public static function log( $investor_id, $action, $detail = '' ) {
		global $wpdb;
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		$wpdb->insert(
			self::logs(),
			array(
				'investor_id' => $investor_id,
				'user_id'     => get_current_user_id(),
				'action'      => $action,
				'detail'      => $detail,
				'ip_address'  => $ip,
				'created_at'  => current_time( 'mysql' ),
			)
		);
	}
}
