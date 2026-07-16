<?php
/**
 * Activation + upgrades: create custom tables, the investor role, the protected
 * upload directory, and the portal page.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Activator {

	public static function activate() {
		self::create_tables();
		self::add_role();
		self::create_upload_dir();
		self::create_pages();
		flush_rewrite_rules();
	}

	public static function deactivate() {
		wp_clear_scheduled_hook( 'awivest_msi_daily' );
		flush_rewrite_rules();
	}

	/**
	 * Create or upgrade all tables. Safe to run repeatedly (dbDelta is idempotent).
	 * Public so the bootstrap upgrade routine can call it on version bumps.
	 */
	public static function create_tables() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$charset = $wpdb->get_charset_collate();
		$p       = $wpdb->prefix;

		$queries = array();

		$queries[] = "CREATE TABLE {$p}awivest_investors (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			investor_id VARCHAR(40) NOT NULL,
			wp_user_id BIGINT(20) UNSIGNED NOT NULL,
			full_name VARCHAR(190) DEFAULT '',
			phone VARCHAR(40) DEFAULT '',
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			prev_status VARCHAR(20) DEFAULT '',
			kyc_status VARCHAR(20) NOT NULL DEFAULT 'not_submitted',
			id_number VARCHAR(60) DEFAULT '',
			kra_pin VARCHAR(60) DEFAULT '',
			dob DATE NULL,
			postal_address VARCHAR(190) DEFAULT '',
			physical_address VARCHAR(190) DEFAULT '',
			nok_name VARCHAR(190) DEFAULT '',
			nok_relationship VARCHAR(90) DEFAULT '',
			nok_phone VARCHAR(40) DEFAULT '',
			nok_id VARCHAR(60) DEFAULT '',
			beneficiary_name VARCHAR(190) DEFAULT '',
			beneficiary_relationship VARCHAR(90) DEFAULT '',
			beneficiary_phone VARCHAR(40) DEFAULT '',
			beneficiary_id VARCHAR(60) DEFAULT '',
			nominee_name VARCHAR(190) DEFAULT '',
			nominee_relationship VARCHAR(90) DEFAULT '',
			nominee_phone VARCHAR(40) DEFAULT '',
			nominee_id VARCHAR(60) DEFAULT '',
			onboarding_stage VARCHAR(20) NOT NULL DEFAULT 'in_progress',
			returned_reason TEXT NULL,
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY investor_id (investor_id),
			UNIQUE KEY wp_user_id (wp_user_id)
		) {$charset};";

		$queries[] = "CREATE TABLE {$p}awivest_kyc (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			investor_id VARCHAR(40) NOT NULL,
			document_type VARCHAR(60) NOT NULL,
			file_path VARCHAR(255) NOT NULL,
			original_name VARCHAR(190) DEFAULT '',
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			admin_comment TEXT NULL,
			reviewed_by BIGINT(20) UNSIGNED DEFAULT 0,
			reviewed_at DATETIME NULL,
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY investor_id (investor_id)
		) {$charset};";

		$queries[] = "CREATE TABLE {$p}awivest_documents (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			investor_id VARCHAR(40) DEFAULT '',
			title VARCHAR(190) NOT NULL,
			file_path VARCHAR(255) NOT NULL,
			document_type VARCHAR(60) DEFAULT 'general',
			visibility VARCHAR(20) NOT NULL DEFAULT 'all',
			uploaded_by BIGINT(20) UNSIGNED DEFAULT 0,
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY investor_id (investor_id)
		) {$charset};";

		$queries[] = "CREATE TABLE {$p}awivest_agreements (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			investor_id VARCHAR(40) NOT NULL,
			title VARCHAR(190) DEFAULT '',
			pandadoc_id VARCHAR(120) DEFAULT '',
			signature_path VARCHAR(255) DEFAULT '',
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			signed_at DATETIME NULL,
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY investor_id (investor_id)
		) {$charset};";

		$queries[] = "CREATE TABLE {$p}awivest_consents (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			investor_id VARCHAR(40) NOT NULL,
			document_id BIGINT(20) UNSIGNED NOT NULL DEFAULT 0,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			signature_path VARCHAR(255) DEFAULT '',
			pandadoc_id VARCHAR(120) DEFAULT '',
			created_at DATETIME NOT NULL,
			decided_at DATETIME NULL,
			PRIMARY KEY  (id),
			KEY investor_id (investor_id)
		) {$charset};";

		$queries[] = "CREATE TABLE {$p}awivest_audit_log (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			investor_id VARCHAR(40) DEFAULT '',
			user_id BIGINT(20) UNSIGNED DEFAULT 0,
			action VARCHAR(60) NOT NULL,
			detail TEXT NULL,
			ip_address VARCHAR(60) DEFAULT '',
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY investor_id (investor_id)
		) {$charset};";

		/* ---- Phase 2: online forms (admin-managed definitions) ---- */
		$queries[] = "CREATE TABLE {$p}awivest_form_defs (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			slug VARCHAR(60) NOT NULL,
			title VARCHAR(190) NOT NULL,
			description TEXT NULL,
			fields LONGTEXT NULL,
			require_signature TINYINT(1) NOT NULL DEFAULT 1,
			status VARCHAR(20) NOT NULL DEFAULT 'active',
			sort_order INT NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY slug (slug)
		) {$charset};";

		/* ---- Phase 2: online form submissions (save-progress) ---- */
		$queries[] = "CREATE TABLE {$p}awivest_form_submissions (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			investor_id VARCHAR(40) NOT NULL,
			form_key VARCHAR(60) NOT NULL,
			data LONGTEXT NULL,
			signature_path VARCHAR(255) DEFAULT '',
			status VARCHAR(20) NOT NULL DEFAULT 'draft',
			admin_comment TEXT NULL,
			reviewed_by BIGINT(20) UNSIGNED DEFAULT 0,
			reviewed_at DATETIME NULL,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY investor_form (investor_id, form_key)
		) {$charset};";

		/* ---- Phase 3: opportunities + interests ---- */
		$queries[] = "CREATE TABLE {$p}awivest_opportunities (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			title VARCHAR(190) NOT NULL,
			summary TEXT NULL,
			details LONGTEXT NULL,
			target_amount DECIMAL(16,2) DEFAULT 0,
			min_investment DECIMAL(16,2) DEFAULT 0,
			status VARCHAR(20) NOT NULL DEFAULT 'open',
			created_by BIGINT(20) UNSIGNED DEFAULT 0,
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY status (status)
		) {$charset};";

		$queries[] = "CREATE TABLE {$p}awivest_interests (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			opportunity_id BIGINT(20) UNSIGNED NOT NULL,
			investor_id VARCHAR(40) NOT NULL,
			amount DECIMAL(16,2) DEFAULT 0,
			message TEXT NULL,
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY opportunity_id (opportunity_id),
			KEY investor_id (investor_id)
		) {$charset};";

		/* ---- Phase 4: M-Pesa transactions + dividends ---- */
		$queries[] = "CREATE TABLE {$p}awivest_mpesa_tx (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			investor_id VARCHAR(40) DEFAULT '',
			phone VARCHAR(20) DEFAULT '',
			amount DECIMAL(16,2) DEFAULT 0,
			account_ref VARCHAR(60) DEFAULT '',
			merchant_request_id VARCHAR(80) DEFAULT '',
			checkout_request_id VARCHAR(80) DEFAULT '',
			mpesa_receipt VARCHAR(40) DEFAULT '',
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			result_desc VARCHAR(190) DEFAULT '',
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY investor_id (investor_id),
			KEY checkout_request_id (checkout_request_id)
		) {$charset};";

		$queries[] = "CREATE TABLE {$p}awivest_dividends (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			investor_id VARCHAR(40) NOT NULL,
			period VARCHAR(40) DEFAULT '',
			amount DECIMAL(16,2) DEFAULT 0,
			status VARCHAR(20) NOT NULL DEFAULT 'declared',
			note VARCHAR(190) DEFAULT '',
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY investor_id (investor_id)
		) {$charset};";

		/* ---- Welfare module ---- */
		$queries[] = "CREATE TABLE {$p}awivest_welfare (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			investor_id VARCHAR(40) NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			next_of_kin VARCHAR(190) DEFAULT '',
			next_of_kin_phone VARCHAR(40) DEFAULT '',
			dependants TEXT NULL,
			monthly_contribution DECIMAL(16,2) DEFAULT 0,
			enrolled_at DATETIME NULL,
			exit_reason TEXT NULL,
			exit_at DATETIME NULL,
			admin_comment VARCHAR(190) DEFAULT '',
			reviewed_by BIGINT(20) UNSIGNED DEFAULT 0,
			reviewed_at DATETIME NULL,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY investor_id (investor_id)
		) {$charset};";

		$queries[] = "CREATE TABLE {$p}awivest_welfare_claims (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			investor_id VARCHAR(40) NOT NULL,
			claim_type VARCHAR(60) NOT NULL,
			amount DECIMAL(16,2) DEFAULT 0,
			description TEXT NULL,
			file_path VARCHAR(255) DEFAULT '',
			status VARCHAR(20) NOT NULL DEFAULT 'pending',
			admin_comment VARCHAR(190) DEFAULT '',
			reviewed_by BIGINT(20) UNSIGNED DEFAULT 0,
			reviewed_at DATETIME NULL,
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY investor_id (investor_id)
		) {$charset};";

		foreach ( $queries as $q ) {
			dbDelta( $q );
		}

		// Member Success Index (MSI) tables (Phase 1).
		if ( class_exists( 'AWIVEST_MSI_Schema' ) ) {
			AWIVEST_MSI_Schema::create_tables();
		}

		update_option( 'awivest_db_version', AWIVEST_VERSION );

		// Seed the standard online forms the first time (admins can edit them after).
		if ( class_exists( 'AWIVEST_Forms' ) ) {
			AWIVEST_Forms::seed_defaults();
		}
	}

	private static function add_role() {
		add_role( AWIVEST_ROLE, 'AWIVEST Investor', array( 'read' => true ) );
	}

	/**
	 * Absolute path to the protected upload directory.
	 */
	public static function upload_basedir() {
		$uploads = wp_upload_dir();
		return trailingslashit( $uploads['basedir'] ) . 'awivest-secure';
	}

	private static function create_upload_dir() {
		$dir = self::upload_basedir();
		if ( ! file_exists( $dir ) ) {
			wp_mkdir_p( $dir );
		}

		$htaccess = trailingslashit( $dir ) . '.htaccess';
		if ( ! file_exists( $htaccess ) ) {
			$rules  = "Order Deny,Allow\nDeny from all\n";
			$rules .= "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n";
			@file_put_contents( $htaccess, $rules );
		}

		$index = trailingslashit( $dir ) . 'index.php';
		if ( ! file_exists( $index ) ) {
			@file_put_contents( $index, "<?php // Silence is golden.\n" );
		}
	}

	private static function create_pages() {
		$existing = get_option( 'awivest_portal_page' );
		if ( $existing && get_post( $existing ) ) {
			return;
		}
		$page_id = wp_insert_post(
			array(
				'post_title'   => 'Investor Portal',
				'post_name'    => 'investor-portal',
				'post_content' => '[awivest_portal]',
				'post_status'  => 'publish',
				'post_type'    => 'page',
			)
		);
		if ( $page_id && ! is_wp_error( $page_id ) ) {
			update_option( 'awivest_portal_page', $page_id );
		}
	}
}
