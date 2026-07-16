<?php
/**
 * Phase 3/4: Reporting & analytics with CSV export.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Reports {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_menu', array( $this, 'admin_menu' ), 11 );
		add_action( 'admin_init', array( $this, 'maybe_export' ) );
	}

	public function admin_menu() {
		add_submenu_page( 'awivest', 'Reports', 'Reports', 'manage_options', 'awivest-reports', array( $this, 'admin_page' ) );
	}

	private function export_url( $type ) {
		return wp_nonce_url( add_query_arg( array( 'page' => 'awivest-reports', 'awivest_export' => $type ), admin_url( 'admin.php' ) ), 'awivest_export' );
	}

	public function maybe_export() {
		if ( ! current_user_can( 'manage_options' ) || ! isset( $_GET['awivest_export'] ) ) {
			return;
		}
		check_admin_referer( 'awivest_export' );
		$type = sanitize_key( wp_unslash( $_GET['awivest_export'] ) );
		global $wpdb;

		$map = array(
			'investors'   => array( 'AWIVEST-investors.csv', array( 'investor_id', 'full_name', 'phone', 'status', 'kyc_status', 'created_at' ), 'SELECT investor_id, full_name, phone, status, kyc_status, created_at FROM ' . AWIVEST_DB::investors() . ' ORDER BY created_at DESC' ),
			'submissions' => array( 'AWIVEST-submissions.csv', array( 'investor_id', 'document_type', 'status', 'admin_comment', 'created_at' ), 'SELECT investor_id, document_type, status, admin_comment, created_at FROM ' . AWIVEST_DB::kyc() . ' ORDER BY created_at DESC' ),
			'payments'    => array( 'AWIVEST-payments.csv', array( 'investor_id', 'phone', 'amount', 'mpesa_receipt', 'status', 'created_at' ), 'SELECT investor_id, phone, amount, mpesa_receipt, status, created_at FROM ' . AWIVEST_DB::mpesa() . ' ORDER BY created_at DESC' ),
			'dividends'   => array( 'AWIVEST-dividends.csv', array( 'investor_id', 'period', 'amount', 'status', 'note', 'created_at' ), 'SELECT investor_id, period, amount, status, note, created_at FROM ' . AWIVEST_DB::dividends() . ' ORDER BY created_at DESC' ),
		);

		if ( ! isset( $map[ $type ] ) ) {
			return;
		}
		list( $filename, $headers, $sql ) = $map[ $type ];
		$rows = $wpdb->get_results( $sql, ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL

		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="' . $filename . '"' );
		$out = fopen( 'php://output', 'w' );
		fputcsv( $out, $headers );
		if ( $rows ) {
			foreach ( $rows as $row ) {
				$line = array();
				foreach ( $headers as $h ) {
					$line[] = isset( $row[ $h ] ) ? $row[ $h ] : '';
				}
				fputcsv( $out, $line );
			}
		}
		fclose( $out );
		exit;
	}

	private function num( $sql ) {
		global $wpdb;
		return (float) $wpdb->get_var( $sql ); // phpcs:ignore WordPress.DB.PreparedSQL
	}

	public function admin_page() {
		$investors      = (int) $this->num( 'SELECT COUNT(*) FROM ' . AWIVEST_DB::investors() );
		$active         = (int) $this->num( 'SELECT COUNT(*) FROM ' . AWIVEST_DB::investors() . " WHERE status = 'active'" );
		$kyc_pending    = (int) $this->num( 'SELECT COUNT(*) FROM ' . AWIVEST_DB::kyc() . " WHERE status = 'pending'" );
		$forms_pending  = (int) $this->num( 'SELECT COUNT(*) FROM ' . AWIVEST_DB::forms() . " WHERE status = 'submitted'" );
		$contributions  = $this->num( 'SELECT COALESCE(SUM(amount),0) FROM ' . AWIVEST_DB::mpesa() . " WHERE status = 'success'" );
		$dividends_paid = $this->num( 'SELECT COALESCE(SUM(amount),0) FROM ' . AWIVEST_DB::dividends() . " WHERE status = 'paid'" );
		$interest_total = $this->num( 'SELECT COALESCE(SUM(amount),0) FROM ' . AWIVEST_DB::interests() );
		$open_opps      = (int) $this->num( 'SELECT COUNT(*) FROM ' . AWIVEST_DB::opportunities() . " WHERE status = 'open'" );

		echo '<div class="wrap"><h1>Reports &amp; Analytics</h1>';
		echo '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:16px">';
		$this->box( 'Total Investors', $investors );
		$this->box( 'Active Members', $active );
		$this->box( 'KYC Pending', $kyc_pending );
		$this->box( 'Forms Awaiting Review', $forms_pending );
		$this->box( 'Open Opportunities', $open_opps );
		$this->box( 'Total Interest (KES)', number_format( $interest_total, 2 ) );
		$this->box( 'Contributions Received (KES)', number_format( $contributions, 2 ) );
		$this->box( 'Dividends Paid (KES)', number_format( $dividends_paid, 2 ) );
		echo '</div>';

		echo '<h2 style="margin-top:24px">Export CSV</h2><p>';
		echo '<a class="button" href="' . esc_url( $this->export_url( 'investors' ) ) . '">Investors</a> ';
		echo '<a class="button" href="' . esc_url( $this->export_url( 'submissions' ) ) . '">Submissions</a> ';
		echo '<a class="button" href="' . esc_url( $this->export_url( 'payments' ) ) . '">Payments</a> ';
		echo '<a class="button" href="' . esc_url( $this->export_url( 'dividends' ) ) . '">Dividends</a>';
		echo '</p></div>';
	}

	private function box( $label, $value ) {
		echo '<div style="background:#fff;border:1px solid #ccd0d4;padding:16px 20px;min-width:170px;border-radius:6px">';
		echo '<div style="font-size:13px;color:#666">' . esc_html( $label ) . '</div>';
		echo '<div style="font-size:26px;font-weight:700">' . esc_html( $value ) . '</div></div>';
	}
}
