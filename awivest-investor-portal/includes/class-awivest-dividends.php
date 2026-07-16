<?php
/**
 * Phase 4: Dividend tracking.
 *
 * Admins declare/record dividends per investor; investors view their dividends.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Dividends {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_menu', array( $this, 'admin_menu' ), 11 );
		add_action( 'admin_init', array( $this, 'admin_handle' ) );
	}

	/* ---------------- Front-end ---------------- */

	public function render_view() {
		$investor = AWIVEST_DB::current_investor();
		if ( ! $investor ) {
			return;
		}
		global $wpdb;
		$rows  = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::dividends() . ' WHERE investor_id = %s ORDER BY created_at DESC', $investor->investor_id ) );
		$total = (float) $wpdb->get_var( $wpdb->prepare( 'SELECT COALESCE(SUM(amount),0) FROM ' . AWIVEST_DB::dividends() . " WHERE investor_id = %s AND status = 'paid'", $investor->investor_id ) );

		echo '<div class="awivest-card"><h2>My Dividends</h2>';
		echo '<div class="awivest-grid"><div class="awivest-stat"><span>Total Paid</span><strong>KES ' . esc_html( number_format( $total, 2 ) ) . '</strong></div></div>';
		echo '<table class="awivest-table"><thead><tr><th>Period</th><th>Amount (KES)</th><th>Status</th><th>Note</th><th>Date</th></tr></thead><tbody>';
		if ( $rows ) {
			foreach ( $rows as $r ) {
				echo '<tr><td>' . esc_html( $r->period ) . '</td><td>' . esc_html( number_format( (float) $r->amount, 2 ) ) . '</td><td><span class="awivest-badge ' . esc_attr( $r->status ) . '">' . esc_html( ucfirst( $r->status ) ) . '</span></td><td>' . esc_html( $r->note ) . '</td><td>' . esc_html( mysql2date( 'M j, Y', $r->created_at ) ) . '</td></tr>';
			}
		} else {
			echo '<tr><td colspan="5">No dividends recorded yet.</td></tr>';
		}
		echo '</tbody></table></div>';
	}

	/* ---------------- Admin ---------------- */

	public function admin_menu() {
		add_submenu_page( 'awivest', 'Dividends', 'Dividends', 'manage_options', 'awivest-dividends', array( $this, 'admin_page' ) );
	}

	public function admin_handle() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		if ( isset( $_POST['awivest_admin_action'] ) && 'save_dividend' === $_POST['awivest_admin_action'] ) {
			check_admin_referer( 'awivest_dividend' );
			global $wpdb;
			$investor_id = isset( $_POST['investor_id'] ) ? sanitize_text_field( wp_unslash( $_POST['investor_id'] ) ) : '';
			$inv         = AWIVEST_DB::get_investor_by_investor_id( $investor_id );
			if ( $inv ) {
				$status = isset( $_POST['status'] ) ? sanitize_key( $_POST['status'] ) : 'declared';
				$wpdb->insert(
					AWIVEST_DB::dividends(),
					array(
						'investor_id' => $investor_id,
						'period'      => isset( $_POST['period'] ) ? sanitize_text_field( wp_unslash( $_POST['period'] ) ) : '',
						'amount'      => isset( $_POST['amount'] ) ? floatval( $_POST['amount'] ) : 0,
						'status'      => $status,
						'note'        => isset( $_POST['note'] ) ? sanitize_text_field( wp_unslash( $_POST['note'] ) ) : '',
						'created_at'  => current_time( 'mysql' ),
					)
				);
				AWIVEST_DB::log( $investor_id, 'dividend', $status );
				$user = get_user_by( 'id', $inv->wp_user_id );
				if ( $user && 'paid' === $status ) {
					AWIVEST_Notifications::send( $user->user_email, 'Dividend paid', array( 'A dividend of KES ' . esc_html( number_format( floatval( $_POST['amount'] ), 2 ) ) . ' has been recorded for you.' ) );
				}
			}
			wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-dividends', 'updated' => 1 ), admin_url( 'admin.php' ) ) );
			exit;
		}
	}

	public function admin_page() {
		global $wpdb;
		$investors = $wpdb->get_results( 'SELECT investor_id, full_name FROM ' . AWIVEST_DB::investors() . ' ORDER BY full_name' );
		$rows      = $wpdb->get_results( 'SELECT * FROM ' . AWIVEST_DB::dividends() . ' ORDER BY created_at DESC LIMIT 200' );

		echo '<div class="wrap"><h1>Dividends</h1>';
		echo '<h2>Record Dividend</h2><form method="post">';
		wp_nonce_field( 'awivest_dividend' );
		echo '<input type="hidden" name="awivest_admin_action" value="save_dividend">';
		echo '<table class="form-table">';
		echo '<tr><th>Investor</th><td><select name="investor_id" required><option value="">-- select --</option>';
		foreach ( $investors as $i ) {
			echo '<option value="' . esc_attr( $i->investor_id ) . '">' . esc_html( $i->investor_id . ' - ' . $i->full_name ) . '</option>';
		}
		echo '</select></td></tr>';
		echo '<tr><th>Period</th><td><input type="text" name="period" placeholder="e.g. 2026 H1" class="regular-text"></td></tr>';
		echo '<tr><th>Amount (KES)</th><td><input type="number" step="0.01" name="amount" value="0" required></td></tr>';
		echo '<tr><th>Status</th><td><select name="status"><option value="declared">Declared</option><option value="paid">Paid</option></select></td></tr>';
		echo '<tr><th>Note</th><td><input type="text" name="note" class="regular-text"></td></tr>';
		echo '</table><p><button class="button button-primary">Save</button></p></form>';

		echo '<h2>Dividend Records</h2><table class="wp-list-table widefat fixed striped"><thead><tr><th>Investor</th><th>Period</th><th>Amount (KES)</th><th>Status</th><th>Note</th><th>Date</th></tr></thead><tbody>';
		if ( $rows ) {
			foreach ( $rows as $r ) {
				echo '<tr><td>' . esc_html( $r->investor_id ) . '</td><td>' . esc_html( $r->period ) . '</td><td>' . esc_html( number_format( (float) $r->amount, 2 ) ) . '</td><td>' . esc_html( $r->status ) . '</td><td>' . esc_html( $r->note ) . '</td><td>' . esc_html( mysql2date( 'M j, Y', $r->created_at ) ) . '</td></tr>';
			}
		} else {
			echo '<tr><td colspan="6">No dividends recorded yet.</td></tr>';
		}
		echo '</tbody></table></div>';
	}
}
