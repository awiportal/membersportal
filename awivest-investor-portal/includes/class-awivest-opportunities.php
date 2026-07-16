<?php
/**
 * Phase 3: Investment opportunities.
 *
 * Admins publish opportunities; investors browse open ones and express interest.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Opportunities {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'handle' ) );
		add_action( 'admin_menu', array( $this, 'admin_menu' ), 11 );
		add_action( 'admin_init', array( $this, 'admin_handle' ) );
	}

	/* ---------------- Front-end ---------------- */

	public function handle() {
		if ( empty( $_POST['awivest_action'] ) || 'express_interest' !== $_POST['awivest_action'] ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in.' );
		}
		if ( ! isset( $_POST['awivest_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['awivest_nonce'] ) ), 'awivest_interest' ) ) {
			wp_die( 'Security check failed.' );
		}
		$investor = AWIVEST_DB::current_investor();
		if ( ! $investor ) {
			wp_die( 'Investor profile not found.' );
		}

		global $wpdb;
		$opp_id = isset( $_POST['opportunity_id'] ) ? absint( $_POST['opportunity_id'] ) : 0;
		$amount = isset( $_POST['amount'] ) ? floatval( $_POST['amount'] ) : 0;
		$message = isset( $_POST['message'] ) ? sanitize_textarea_field( wp_unslash( $_POST['message'] ) ) : '';

		$opp = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::opportunities() . ' WHERE id = %d', $opp_id ) );
		if ( ! $opp || 'open' !== $opp->status ) {
			AWIVEST_Auth::instance()->flash( 'error', array( 'That opportunity is not available.' ) );
			wp_safe_redirect( add_query_arg( 'view', 'opportunities', AWIVEST_Auth::instance()->portal_url() ) );
			exit;
		}

		$wpdb->insert(
			AWIVEST_DB::interests(),
			array(
				'opportunity_id' => $opp_id,
				'investor_id'    => $investor->investor_id,
				'amount'         => $amount,
				'message'        => $message,
				'created_at'     => current_time( 'mysql' ),
			)
		);

		AWIVEST_DB::log( $investor->investor_id, 'interest', 'opp:' . $opp_id );
		AWIVEST_Notifications::send(
			AWIVEST_Notifications::admin_email(),
			'New investment interest',
			array( 'Investor ' . esc_html( $investor->investor_id ) . ' expressed interest in "' . esc_html( $opp->title ) . '" for KES ' . esc_html( number_format( $amount, 2 ) ) . '.' )
		);
		AWIVEST_Auth::instance()->flash( 'success', array( 'Your interest has been recorded. Our team will contact you.' ) );
		wp_safe_redirect( add_query_arg( 'view', 'opportunities', AWIVEST_Auth::instance()->portal_url() ) );
		exit;
	}

	public function render_view() {
		global $wpdb;
		$opps = $wpdb->get_results( 'SELECT * FROM ' . AWIVEST_DB::opportunities() . " WHERE status = 'open' ORDER BY created_at DESC" );
		echo '<div class="awivest-card"><h2>Investment Opportunities</h2>';
		if ( ! $opps ) {
			echo '<p>No open opportunities at the moment. Please check back later.</p></div>';
			return;
		}
		echo '</div>';
		foreach ( $opps as $opp ) {
			echo '<div class="awivest-card">';
			echo '<h3>' . esc_html( $opp->title ) . '</h3>';
			if ( $opp->summary ) {
				echo '<p>' . esc_html( $opp->summary ) . '</p>';
			}
			if ( $opp->details ) {
				echo '<div>' . wp_kses_post( wpautop( $opp->details ) ) . '</div>';
			}
			echo '<p class="awivest-hint">Target: KES ' . esc_html( number_format( (float) $opp->target_amount, 2 ) ) . ' &middot; Minimum: KES ' . esc_html( number_format( (float) $opp->min_investment, 2 ) ) . '</p>';
			echo '<form method="post" class="awivest-form" style="margin-top:10px">';
			wp_nonce_field( 'awivest_interest', 'awivest_nonce' );
			echo '<input type="hidden" name="awivest_action" value="express_interest">';
			echo '<input type="hidden" name="opportunity_id" value="' . (int) $opp->id . '">';
			echo '<label>Amount you wish to invest (KES)<input type="number" step="0.01" min="' . esc_attr( $opp->min_investment ) . '" name="amount" required></label>';
			echo '<label>Message (optional)<textarea name="message" rows="2"></textarea></label>';
			echo '<button class="awivest-btn" type="submit">Express Interest</button>';
			echo '</form></div>';
		}
	}

	/* ---------------- Admin ---------------- */

	public function admin_menu() {
		add_submenu_page( 'awivest', 'Opportunities', 'Opportunities', 'manage_options', 'awivest-opportunities', array( $this, 'admin_page' ) );
	}

	public function admin_handle() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		if ( isset( $_POST['awivest_admin_action'] ) && 'save_opportunity' === $_POST['awivest_admin_action'] ) {
			check_admin_referer( 'awivest_opportunity' );
			global $wpdb;
			$data = array(
				'title'          => isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '',
				'summary'        => isset( $_POST['summary'] ) ? sanitize_textarea_field( wp_unslash( $_POST['summary'] ) ) : '',
				'details'        => isset( $_POST['details'] ) ? wp_kses_post( wp_unslash( $_POST['details'] ) ) : '',
				'target_amount'  => isset( $_POST['target_amount'] ) ? floatval( $_POST['target_amount'] ) : 0,
				'min_investment' => isset( $_POST['min_investment'] ) ? floatval( $_POST['min_investment'] ) : 0,
				'status'         => isset( $_POST['status'] ) ? sanitize_key( $_POST['status'] ) : 'open',
			);
			$id = isset( $_POST['opportunity_id'] ) ? absint( $_POST['opportunity_id'] ) : 0;
			if ( $id ) {
				$wpdb->update( AWIVEST_DB::opportunities(), $data, array( 'id' => $id ) );
			} else {
				$data['created_by'] = get_current_user_id();
				$data['created_at'] = current_time( 'mysql' );
				$wpdb->insert( AWIVEST_DB::opportunities(), $data );
			}
			wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-opportunities', 'updated' => 1 ), admin_url( 'admin.php' ) ) );
			exit;
		}

		if ( isset( $_GET['awivest_opp_delete'] ) ) {
			check_admin_referer( 'awivest_opp_delete' );
			global $wpdb;
			$wpdb->delete( AWIVEST_DB::opportunities(), array( 'id' => absint( $_GET['awivest_opp_delete'] ) ) );
			wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-opportunities' ), admin_url( 'admin.php' ) ) );
			exit;
		}
	}

	public function admin_page() {
		global $wpdb;
		$opps     = $wpdb->get_results( 'SELECT * FROM ' . AWIVEST_DB::opportunities() . ' ORDER BY created_at DESC' );
		$interest = $wpdb->get_results( 'SELECT i.*, o.title FROM ' . AWIVEST_DB::interests() . ' i LEFT JOIN ' . AWIVEST_DB::opportunities() . ' o ON o.id = i.opportunity_id ORDER BY i.created_at DESC LIMIT 100' );

		echo '<div class="wrap"><h1>Investment Opportunities</h1>';

		echo '<h2>Add Opportunity</h2><form method="post">';
		wp_nonce_field( 'awivest_opportunity' );
		echo '<input type="hidden" name="awivest_admin_action" value="save_opportunity">';
		echo '<table class="form-table">';
		echo '<tr><th>Title</th><td><input type="text" name="title" class="regular-text" required></td></tr>';
		echo '<tr><th>Summary</th><td><textarea name="summary" rows="2" class="large-text"></textarea></td></tr>';
		echo '<tr><th>Details</th><td><textarea name="details" rows="5" class="large-text"></textarea></td></tr>';
		echo '<tr><th>Target Amount (KES)</th><td><input type="number" step="0.01" name="target_amount" value="0"></td></tr>';
		echo '<tr><th>Minimum Investment (KES)</th><td><input type="number" step="0.01" name="min_investment" value="0"></td></tr>';
		echo '<tr><th>Status</th><td><select name="status"><option value="open">Open</option><option value="closed">Closed</option></select></td></tr>';
		echo '</table><p><button class="button button-primary">Save Opportunity</button></p></form>';

		echo '<h2>Opportunities</h2><table class="wp-list-table widefat fixed striped"><thead><tr><th>Title</th><th>Target</th><th>Min</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>';
		if ( $opps ) {
			foreach ( $opps as $o ) {
				$del = wp_nonce_url( add_query_arg( array( 'page' => 'awivest-opportunities', 'awivest_opp_delete' => $o->id ), admin_url( 'admin.php' ) ), 'awivest_opp_delete' );
				echo '<tr><td>' . esc_html( $o->title ) . '</td><td>' . esc_html( number_format( (float) $o->target_amount, 2 ) ) . '</td><td>' . esc_html( number_format( (float) $o->min_investment, 2 ) ) . '</td><td>' . esc_html( $o->status ) . '</td><td>' . esc_html( mysql2date( 'M j, Y', $o->created_at ) ) . '</td><td><a href="' . esc_url( $del ) . '" onclick="return confirm(\'Delete this opportunity?\')">Delete</a></td></tr>';
			}
		} else {
			echo '<tr><td colspan="6">No opportunities yet.</td></tr>';
		}
		echo '</tbody></table>';

		echo '<h2>Expressed Interest</h2><table class="wp-list-table widefat fixed striped"><thead><tr><th>Investor</th><th>Opportunity</th><th>Amount (KES)</th><th>Message</th><th>Date</th></tr></thead><tbody>';
		if ( $interest ) {
			foreach ( $interest as $i ) {
				echo '<tr><td>' . esc_html( $i->investor_id ) . '</td><td>' . esc_html( $i->title ) . '</td><td>' . esc_html( number_format( (float) $i->amount, 2 ) ) . '</td><td>' . esc_html( $i->message ) . '</td><td>' . esc_html( mysql2date( 'M j, Y', $i->created_at ) ) . '</td></tr>';
			}
		} else {
			echo '<tr><td colspan="5">No interest recorded yet.</td></tr>';
		}
		echo '</tbody></table></div>';
	}
}
