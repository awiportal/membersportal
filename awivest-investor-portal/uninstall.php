<?php
/**
 * Uninstall handler.
 *
 * By default investor data is preserved when the plugin is deleted, so accidental
 * deletion never destroys records. To wipe all AWIVEST tables and the role, add
 * this line to wp-config.php before deleting the plugin:
 *
 *     define( 'AWIVEST_REMOVE_DATA', true );
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

if ( defined( 'AWIVEST_REMOVE_DATA' ) && AWIVEST_REMOVE_DATA ) {
	global $wpdb;
	$tables = array(
		'awivest_investors',
		'awivest_kyc',
		'awivest_documents',
		'awivest_agreements',
		'awivest_audit_log',
		'awivest_form_submissions',
		'awivest_opportunities',
		'awivest_interests',
		'awivest_mpesa_tx',
		'awivest_dividends',
		'awivest_welfare',
		'awivest_welfare_claims',
		'awivest_form_defs',
		'awivest_consents',
	);
	foreach ( $tables as $t ) {
		$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}{$t}" ); // phpcs:ignore
	}
	if ( function_exists( 'remove_role' ) ) {
		remove_role( 'awivest_investor' );
	}
	$options = array(
		'awivest_db_version',
		'awivest_portal_page',
		'awivest_admin_email',
		'awivest_from_name',
		'awivest_from_email',
		'awivest_max_upload_mb',
		'awivest_announcement',
		'awivest_pandadoc_api_key',
		'awivest_pandadoc_template_id',
		'awivest_pandadoc_onboarding_template',
		'awivest_pandadoc_role',
		'awivest_pandadoc_webhook_secret',
		'awivest_mpesa_env',
		'awivest_mpesa_consumer_key',
		'awivest_mpesa_consumer_secret',
		'awivest_mpesa_shortcode',
		'awivest_mpesa_passkey',
	);
	foreach ( $options as $o ) {
		delete_option( $o );
	}
}
