<?php
/**
 * MSI admin analytics + CSV export (v2.11.6).
 *
 * Adds a "Financial Profiles" page under the AWIVEST admin menu showing
 * aggregated, de-identified insights (wellness bands, risk profiles, MCIS tiers
 * and member segments) plus headline averages, and a full CSV export of the
 * dataset built from the same question registry that drives the wizard. Runs in
 * its own class so the large core admin file is untouched.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_MSI_Admin {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_menu', array( $this, 'menu' ), 20 );
		add_action( 'admin_post_awivest_msi_export', array( $this, 'export_csv' ) );
	}

	public function menu() {
		add_submenu_page( 'awivest', 'Financial Profiles', 'Financial Profiles', 'manage_options', 'awivest-msi', array( $this, 'page' ) );
	}

	/** Current scores = the latest submitted assessment per member. */
	private function current_scores() {
		global $wpdb;
		$s = AWIVEST_MSI_Schema::scores();
		$a = AWIVEST_MSI_Schema::assessments();
		return $wpdb->get_results(
			"SELECT sc.*, asm.cycle_label, asm.submitted_at, asm.wp_user_id
			 FROM {$s} sc
			 INNER JOIN {$a} asm ON asm.id = sc.assessment_id
			 WHERE asm.status = 'submitted'
			   AND asm.id = ( SELECT MAX(b.id) FROM {$a} b WHERE b.investor_id = asm.investor_id AND b.status = 'submitted' )"
		);
	}

	public function page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'You do not have permission to view this page.' );
		}
		global $wpdb;
		$a_tbl = AWIVEST_MSI_Schema::assessments();
		$rows  = $this->current_scores();
		$total = count( $rows );

		$started = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$a_tbl} WHERE status = 'draft' AND consent_given = 1" );

		$bands = array();
		$risk  = array();
		$mcis  = array();
		$segp  = array();
		$segs  = array();
		$sum_well = 0;
		$sum_mcis = 0;
		$sum_cap  = 0.0;
		$sum_nw   = 0.0;

		foreach ( $rows as $r ) {
			$band          = AWIVEST_MSI_Scoring::band( (int) $r->wellness_total );
			$bands[ $band ] = ( isset( $bands[ $band ] ) ? $bands[ $band ] : 0 ) + 1;
			$rk            = $r->risk_profile ? ucfirst( $r->risk_profile ) : 'Not set';
			$risk[ $rk ]   = ( isset( $risk[ $rk ] ) ? $risk[ $rk ] : 0 ) + 1;
			$mt            = $r->mcis_tier ? $r->mcis_tier : 'Not set';
			$mcis[ $mt ]   = ( isset( $mcis[ $mt ] ) ? $mcis[ $mt ] : 0 ) + 1;
			$sp            = $r->segment_primary ? $r->segment_primary : 'Unknown';
			$segp[ $sp ]   = ( isset( $segp[ $sp ] ) ? $segp[ $sp ] : 0 ) + 1;
			$ss            = $r->segment_secondary ? $r->segment_secondary : 'Unknown';
			$segs[ $ss ]   = ( isset( $segs[ $ss ] ) ? $segs[ $ss ] : 0 ) + 1;
			$sum_well     += (int) $r->wellness_total;
			$sum_mcis     += (int) $r->mcis_score;
			$sum_cap      += (float) $r->investment_capacity;
			$sum_nw       += (float) $r->net_worth;
		}
		$avg_well = $total ? round( $sum_well / $total ) : 0;
		$avg_mcis = $total ? round( $sum_mcis / $total ) : 0;
		$avg_nw   = $total ? round( $sum_nw / $total ) : 0;

		echo '<div class="wrap">';
		echo '<h1>Financial Profiles (Member Success Index)</h1>';
		echo '<p>Aggregated, de-identified insights from members\' latest submitted Financial Profiles.</p>';

		echo '<div style="display:flex;flex-wrap:wrap;gap:12px;margin:16px 0">';
		$this->stat_card( 'Members profiled', number_format( $total ) );
		$this->stat_card( 'In progress', number_format( $started ) );
		$this->stat_card( 'Avg wellness', $avg_well . '/100' );
		$this->stat_card( 'Avg commitment (MCIS)', $avg_mcis . '/100' );
		$this->stat_card( 'Total monthly capacity', 'KES ' . number_format( $sum_cap ) );
		$this->stat_card( 'Avg net worth', 'KES ' . number_format( $avg_nw ) );
		echo '</div>';

		if ( ! $total ) {
			echo '<p><em>No submitted profiles yet. Breakdowns will appear here as members complete their Financial Profile.</em></p>';
		} else {
			$this->dist_table( 'Financial wellness bands', $bands, $total );
			$this->dist_table( 'Risk profiles', $risk, $total );
			$this->dist_table( 'Commitment tiers (MCIS)', $mcis, $total );
			$this->dist_table( 'Life-stage segments', $segp, $total );
			$this->dist_table( 'Financial-standing segments', $segs, $total );
		}

		$export = wp_nonce_url( admin_url( 'admin-post.php?action=awivest_msi_export' ), 'awivest_msi_export' );
		echo '<h2>Export</h2>';
		echo '<p><a class="button button-primary" href="' . esc_url( $export ) . '">Download full dataset (CSV)</a></p>';
		echo '<p class="description">One row per member (latest submitted profile), with all scores and answers. Handle in line with the Kenya Data Protection Act (2019).</p>';
		echo '</div>';
	}

	private function stat_card( $label, $value ) {
		echo '<div style="background:#fff;border:1px solid #dcdcde;border-radius:8px;padding:12px 16px;min-width:150px">';
		echo '<div style="font-size:12px;color:#646970">' . esc_html( $label ) . '</div>';
		echo '<div style="font-size:22px;font-weight:700">' . esc_html( $value ) . '</div>';
		echo '</div>';
	}

	private function dist_table( $title, $data, $total ) {
		arsort( $data );
		echo '<h2>' . esc_html( $title ) . '</h2>';
		echo '<table class="widefat striped" style="max-width:560px"><thead><tr><th>Category</th><th>Members</th><th>Share</th></tr></thead><tbody>';
		foreach ( $data as $k => $c ) {
			$pct = $total ? round( $c / $total * 100 ) : 0;
			echo '<tr><td>' . esc_html( $k ) . '</td><td>' . (int) $c . '</td><td>' . (int) $pct . '%</td></tr>';
		}
		echo '</tbody></table>';
	}

	/** Stream a CSV of every member's latest submitted profile (scores + answers). */
	public function export_csv() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'You do not have permission to export this data.' );
		}
		check_admin_referer( 'awivest_msi_export' );

		global $wpdb;
		$a    = AWIVEST_MSI_Schema::assessments();
		$rows = $wpdb->get_results(
			"SELECT asm.* FROM {$a} asm
			 WHERE asm.status = 'submitted'
			   AND asm.id = ( SELECT MAX(b.id) FROM {$a} b WHERE b.investor_id = asm.investor_id AND b.status = 'submitted' )
			 ORDER BY asm.investor_id ASC"
		);
		$reg = AWIVEST_MSI_Fields::registry();

		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=awivest-financial-profiles-' . gmdate( 'Ymd' ) . '.csv' );
		$out = fopen( 'php://output', 'w' );

		$head = array( 'Investor ID', 'Name', 'Email', 'Cycle', 'Submitted', 'Wellness', 'Band', 'Risk profile', 'MCIS', 'MCIS tier', 'Life-stage segment', 'Standing segment', 'Net worth', 'Monthly capacity' );
		foreach ( $reg as $key => $def ) {
			$head[] = isset( $def['label'] ) ? $def['label'] : $key;
		}
		fputcsv( $out, $head );

		foreach ( $rows as $r ) {
			$user  = $r->wp_user_id ? get_userdata( (int) $r->wp_user_id ) : null;
			$score = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_MSI_Schema::scores() . ' WHERE assessment_id = %d', (int) $r->id ) );
			$ans   = AWIVEST_MSI_Scoring::answers( (int) $r->id );
			$line  = array(
				$r->investor_id,
				$user ? $user->display_name : '',
				$user ? $user->user_email : '',
				$r->cycle_label,
				$r->submitted_at,
				$score ? (int) $score->wellness_total : '',
				$score ? AWIVEST_MSI_Scoring::band( (int) $score->wellness_total ) : '',
				$score ? $score->risk_profile : '',
				$score ? (int) $score->mcis_score : '',
				$score ? $score->mcis_tier : '',
				$score ? $score->segment_primary : '',
				$score ? $score->segment_secondary : '',
				$score ? $score->net_worth : '',
				$score ? $score->investment_capacity : '',
			);
			foreach ( $reg as $key => $def ) {
				$line[] = isset( $ans[ $key ] ) ? (string) $ans[ $key ]['text'] : '';
			}
			fputcsv( $out, $line );
		}
		fclose( $out );
		exit;
	}
}
