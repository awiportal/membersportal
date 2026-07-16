<?php
/**
 * MSI schema: custom tables for the Member Success Index module.
 *
 * Follows the plugin convention of static table-name accessors (as in
 * AWIVEST_DB) and centralised, idempotent dbDelta creation. AWIVEST_Activator
 * calls create_tables() so the tables are created on activation and re-created
 * on every version bump via the existing awivest_maybe_upgrade() routine.
 *
 * All MSI data keys on the string investor_id (e.g. AWV-2026-0001) to stay
 * consistent with the rest of the plugin's tables.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_MSI_Schema {

	public static function assessments() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_msi_assessments';
	}

	public static function responses() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_msi_responses';
	}

	public static function goals() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_msi_goals';
	}

	public static function scores() {
		global $wpdb;
		return $wpdb->prefix . 'awivest_msi_scores';
	}

	/**
	 * Create or upgrade the MSI tables. Safe to run repeatedly: dbDelta is
	 * idempotent and also adds new columns on later versions without data loss.
	 */
	public static function create_tables() {
		global $wpdb;
		if ( ! function_exists( 'dbDelta' ) ) {
			require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		}
		$charset = $wpdb->get_charset_collate();
		$p       = $wpdb->prefix;

		$queries = array();

		// One row per assessment cycle (draft or submitted snapshot).
		$queries[] = "CREATE TABLE {$p}awivest_msi_assessments (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			investor_id VARCHAR(40) NOT NULL,
			wp_user_id BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
			cycle_label VARCHAR(20) NOT NULL DEFAULT '',
			status VARCHAR(20) NOT NULL DEFAULT 'draft',
			progress_pct TINYINT UNSIGNED NOT NULL DEFAULT 0,
			current_step VARCHAR(40) NOT NULL DEFAULT '',
			draft_json LONGTEXT NULL,
			consent_given TINYINT(1) NOT NULL DEFAULT 0,
			consent_at DATETIME NULL,
			started_at DATETIME NULL,
			submitted_at DATETIME NULL,
			superseded_at DATETIME NULL,
			review_notified_at DATETIME NULL,
			completion_secs INT NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY investor_id (investor_id),
			KEY status (status),
			KEY cycle_label (cycle_label)
		) {$charset};";

		// Structured answers: one row per answered field per assessment.
		$queries[] = "CREATE TABLE {$p}awivest_msi_responses (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			assessment_id BIGINT(20) UNSIGNED NOT NULL,
			investor_id VARCHAR(40) NOT NULL DEFAULT '',
			field_key VARCHAR(64) NOT NULL,
			value_text LONGTEXT NULL,
			value_num DECIMAL(18,2) NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY assessment_field (assessment_id, field_key),
			KEY field_key (field_key)
		) {$charset};";

		// Goals: unlimited per assessment; calculated fields cached at save.
		$queries[] = "CREATE TABLE {$p}awivest_msi_goals (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			assessment_id BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
			investor_id VARCHAR(40) NOT NULL,
			goal_name VARCHAR(160) NOT NULL DEFAULT '',
			category VARCHAR(40) NOT NULL DEFAULT 'other',
			amount_needed DECIMAL(18,2) NOT NULL DEFAULT 0,
			current_savings DECIMAL(18,2) NOT NULL DEFAULT 0,
			monthly_contrib DECIMAL(18,2) NOT NULL DEFAULT 0,
			target_date DATE NULL,
			priority TINYINT UNSIGNED NOT NULL DEFAULT 3,
			expected_return DECIMAL(6,3) NULL,
			remaining_amount DECIMAL(18,2) NULL,
			required_monthly DECIMAL(18,2) NULL,
			projected_value DECIMAL(18,2) NULL,
			progress_pct DECIMAL(5,2) NULL,
			completion_prob DECIMAL(5,2) NULL,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY investor_id (investor_id),
			KEY assessment_id (assessment_id)
		) {$charset};";

		// Computed scores: one row per assessment (includes MCIS - Section 11A).
		$queries[] = "CREATE TABLE {$p}awivest_msi_scores (
			assessment_id BIGINT(20) UNSIGNED NOT NULL,
			investor_id VARCHAR(40) NOT NULL DEFAULT '',
			wellness_total TINYINT UNSIGNED NOT NULL DEFAULT 0,
			savings_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
			debt_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
			investment_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
			insurance_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
			emergency_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
			income_stability_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
			diversification_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
			retirement_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
			risk_profile VARCHAR(20) NOT NULL DEFAULT '',
			risk_raw SMALLINT NOT NULL DEFAULT 0,
			engagement_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
			nps_bucket VARCHAR(12) NOT NULL DEFAULT '',
			literacy_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
			confidence_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
			net_worth DECIMAL(18,2) NOT NULL DEFAULT 0,
			investment_capacity DECIMAL(18,2) NOT NULL DEFAULT 0,
			segment_primary VARCHAR(40) NOT NULL DEFAULT '',
			segment_secondary VARCHAR(40) NOT NULL DEFAULT '',
			mcis_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
			mcis_tier VARCHAR(24) NOT NULL DEFAULT '',
			computed_at DATETIME NULL,
			PRIMARY KEY  (assessment_id),
			KEY investor_id (investor_id)
		) {$charset};";

		foreach ( $queries as $q ) {
			dbDelta( $q );
		}
	}
}
