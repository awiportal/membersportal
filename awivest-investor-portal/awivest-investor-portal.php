<?php
/**
 * Plugin Name: AWIVEST Investor Portal
 * Plugin URI:  https://awivest.com
 * Description: Secure investor portal for AWIVEST - registration with unique Investor IDs, KYC, online forms with save-progress, PandaDoc/internal e-signatures, secure document center, investment opportunities, statements, M-Pesa payments, dividend tracking, reporting, and an admin dashboard. Self-contained and GoDaddy shared-hosting friendly.
 * Version:     2.11.7
 * Author:      AWIVEST
 * License:     GPL-2.0+
 * Text Domain: awivest
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'AWIVEST_VERSION', '2.11.7' );
define( 'AWIVEST_FILE', __FILE__ );
define( 'AWIVEST_DIR', plugin_dir_path( __FILE__ ) );
define( 'AWIVEST_URL', plugin_dir_url( __FILE__ ) );
define( 'AWIVEST_ROLE', 'awivest_investor' );

require_once AWIVEST_DIR . 'includes/class-awivest-db.php';
require_once AWIVEST_DIR . 'includes/class-awivest-activator.php';
require_once AWIVEST_DIR . 'includes/class-awivest-notifications.php';
require_once AWIVEST_DIR . 'includes/class-awivest-security.php';
require_once AWIVEST_DIR . 'includes/class-awivest-auth.php';
require_once AWIVEST_DIR . 'includes/class-awivest-kyc.php';
require_once AWIVEST_DIR . 'includes/class-awivest-documents.php';
require_once AWIVEST_DIR . 'includes/class-awivest-consents.php';
require_once AWIVEST_DIR . 'includes/class-awivest-onboarding.php';
require_once AWIVEST_DIR . 'includes/class-awivest-signature.php';
require_once AWIVEST_DIR . 'includes/class-awivest-forms.php';
require_once AWIVEST_DIR . 'includes/class-awivest-pandadoc.php';
require_once AWIVEST_DIR . 'includes/class-awivest-opportunities.php';
require_once AWIVEST_DIR . 'includes/class-awivest-mpesa.php';
require_once AWIVEST_DIR . 'includes/class-awivest-dividends.php';
require_once AWIVEST_DIR . 'includes/class-awivest-welfare.php';
require_once AWIVEST_DIR . 'includes/class-awivest-reports.php';
require_once AWIVEST_DIR . 'includes/class-awivest-shortcodes.php';
require_once AWIVEST_DIR . 'includes/class-awivest-admin.php';

// Member Success Index (MSI) module - Phase 1 (member discovery, planning, scoring).
require_once AWIVEST_DIR . 'includes/msi/class-msi-schema.php';
require_once AWIVEST_DIR . 'includes/msi/class-msi-fields.php';
require_once AWIVEST_DIR . 'includes/msi/class-msi.php';
require_once AWIVEST_DIR . 'includes/msi/class-msi-scoring.php';
require_once AWIVEST_DIR . 'includes/msi/class-msi-wizard.php';
require_once AWIVEST_DIR . 'includes/msi/class-msi-calculators.php';
require_once AWIVEST_DIR . 'includes/msi/class-msi-goals.php';
require_once AWIVEST_DIR . 'includes/msi/class-msi-calc-widgets.php';
require_once AWIVEST_DIR . 'includes/msi/class-msi-mcis.php';
require_once AWIVEST_DIR . 'includes/msi/class-msi-recommendations.php';
require_once AWIVEST_DIR . 'includes/msi/class-msi-admin.php';

register_activation_hook( __FILE__, array( 'AWIVEST_Activator', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'AWIVEST_Activator', 'deactivate' ) );

/**
 * Boot all plugin components.
 */
function awivest_init() {
	AWIVEST_Notifications::boot();
	AWIVEST_Auth::instance();
	AWIVEST_KYC::instance();
	AWIVEST_Documents::instance();
	AWIVEST_Consents::instance();
	AWIVEST_Onboarding::instance();
	AWIVEST_Signature::instance();
	AWIVEST_Forms::instance();
	AWIVEST_PandaDoc::instance();
	AWIVEST_Opportunities::instance();
	AWIVEST_Mpesa::instance();
	AWIVEST_Dividends::instance();
	AWIVEST_Welfare::instance();
	AWIVEST_Reports::instance();
	AWIVEST_Shortcodes::instance();
	AWIVEST_MSI::instance();
	AWIVEST_MSI_Wizard::instance();
	AWIVEST_MSI_Goals::instance();
	if ( is_admin() ) {
		AWIVEST_Admin::instance();
		AWIVEST_MSI_Admin::instance();
	}
}
add_action( 'plugins_loaded', 'awivest_init' );

/**
 * Front-end assets.
 */
function awivest_enqueue_assets() {
	wp_enqueue_style( 'awivest', AWIVEST_URL . 'assets/css/awivest.css', array(), AWIVEST_VERSION );
	wp_enqueue_style( 'awivest-msi', AWIVEST_URL . 'assets/css/msi.css', array( 'awivest' ), AWIVEST_VERSION );
	wp_enqueue_script( 'awivest', AWIVEST_URL . 'assets/js/awivest.js', array( 'jquery' ), AWIVEST_VERSION, true );
	wp_localize_script(
		'awivest',
		'AWIVEST',
		array(
			'ajaxUrl' => admin_url( 'admin-ajax.php' ),
			'nonce'   => wp_create_nonce( 'awivest_ajax' ),
		)
	);
}
add_action( 'wp_enqueue_scripts', 'awivest_enqueue_assets' );

/**
 * Lightweight upgrade routine: re-run table creation when the stored DB version
 * is older than the code version (so existing installs pick up new tables).
 */
function awivest_maybe_upgrade() {
	if ( get_option( 'awivest_db_version' ) !== AWIVEST_VERSION ) {
		AWIVEST_Activator::create_tables();
	}
}
add_action( 'plugins_loaded', 'awivest_maybe_upgrade', 5 );
