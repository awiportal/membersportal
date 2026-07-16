<?php
/**
 * MSI goal planner + tracker (v2.11.2).
 *
 * Members add unlimited goals; each is projected with AWIVEST_MSI_Calculators
 * (remaining amount, required monthly, projected value, progress %, completion
 * probability). Goals are member-level living objects (keyed by investor_id) so
 * they persist and can be tracked over time. A compact tracker also appears on
 * the member dashboard.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_MSI_Goals {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'handle_post' ) );
	}

	public static function categories() {
		return array(
			'home'       => 'Home',
			'car'        => 'Car',
			'business'   => 'Business',
			'education'  => 'Children Education',
			'retirement' => 'Retirement',
			'travel'     => 'Travel',
			'property'   => 'Property',
			'emergency'  => 'Emergency Fund',
			'investment' => 'Investment',
			'other'      => 'Other',
		);
	}

	public static function priorities() {
		return array(
			1 => 'Very high',
			2 => 'High',
			3 => 'Medium',
			4 => 'Low',
			5 => 'Someday',
		);
	}

	/** All goals for a member, highest priority first. */
	public function get_goals( $inv ) {
		if ( ! $inv ) {
			return array();
		}
		global $wpdb;
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				'SELECT * FROM ' . AWIVEST_MSI_Schema::goals() . ' WHERE investor_id = %s ORDER BY priority ASC, id DESC',
				$inv->investor_id
			)
		);
		return $rows ? $rows : array();
	}

	public function get_goal( $inv, $id ) {
		global $wpdb;
		return $wpdb->get_row(
			$wpdb->prepare(
				'SELECT * FROM ' . AWIVEST_MSI_Schema::goals() . ' WHERE id = %d AND investor_id = %s',
				(int) $id,
				$inv->investor_id
			)
		);
	}

	/** Live projections for a goal row. */
	public function calc( $goal ) {
		$amount  = (float) $goal->amount_needed;
		$savings = (float) $goal->current_savings;
		$monthly = (float) $goal->monthly_contrib;
		$rate    = ( null !== $goal->expected_return && '' !== (string) $goal->expected_return ) ? (float) $goal->expected_return : AWIVEST_MSI_Calculators::expected_return( 'balanced' );
		$months  = AWIVEST_MSI_Calculators::months_until( $goal->target_date );

		$projected = AWIVEST_MSI_Calculators::future_value( $savings, $monthly, $rate, $months );
		$required  = AWIVEST_MSI_Calculators::required_monthly( $amount, $savings, $rate, $months );
		$remaining = max( 0.0, $amount - $savings );
		$progress  = $amount > 0 ? min( 100.0, $projected / $amount * 100 ) : 0.0;
		$prob      = AWIVEST_MSI_Calculators::completion_probability( $projected, $amount, $rate );

		return array(
			'months'    => $months,
			'rate'      => $rate,
			'projected' => $projected,
			'required'  => $required,
			'remaining' => $remaining,
			'progress'  => $progress,
			'prob'      => $prob,
		);
	}

	/* --------------------------- POST handling --------------------------- */

	public function handle_post() {
		$action = isset( $_POST['awivest_action'] ) ? sanitize_key( wp_unslash( $_POST['awivest_action'] ) ) : '';
		if ( 'msi_goal_save' !== $action && 'msi_goal_delete' !== $action ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in.' );
		}
		$nonce = isset( $_POST['awivest_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['awivest_nonce'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, 'awivest_msi_goal' ) ) {
			wp_die( 'Security check failed. Please go back and try again.' );
		}
		$inv  = AWIVEST_DB::current_investor();
		$back = add_query_arg( array( 'view' => 'msi', 'sub' => 'goals' ), AWIVEST_Auth::instance()->portal_url() );
		if ( ! $inv || 'active' !== $inv->status ) {
			AWIVEST_Auth::instance()->flash( 'error', array( 'Your Financial Profile becomes available once your membership is approved.' ) );
			AWIVEST_Auth::go( AWIVEST_Auth::instance()->portal_url() );
			exit;
		}

		if ( 'msi_goal_delete' === $action ) {
			$gid = isset( $_POST['goal_id'] ) ? (int) $_POST['goal_id'] : 0;
			if ( $gid ) {
				global $wpdb;
				$wpdb->delete( AWIVEST_MSI_Schema::goals(), array( 'id' => $gid, 'investor_id' => $inv->investor_id ) );
				AWIVEST_DB::log( $inv->investor_id, 'msi_goal_delete', 'Removed goal #' . $gid );
			}
			AWIVEST_Auth::instance()->flash( 'success', array( 'Goal removed.' ) );
			AWIVEST_Auth::go( $back );
			exit;
		}

		// Save (add or update).
		$gid     = isset( $_POST['goal_id'] ) ? (int) $_POST['goal_id'] : 0;
		$name    = isset( $_POST['goal_name'] ) ? sanitize_text_field( wp_unslash( $_POST['goal_name'] ) ) : '';
		$cat     = isset( $_POST['category'] ) ? sanitize_key( wp_unslash( $_POST['category'] ) ) : 'other';
		$amount  = isset( $_POST['amount_needed'] ) ? (float) $_POST['amount_needed'] : 0.0;
		$savings = isset( $_POST['current_savings'] ) ? (float) $_POST['current_savings'] : 0.0;
		$monthly = isset( $_POST['monthly_contrib'] ) ? (float) $_POST['monthly_contrib'] : 0.0;
		$target  = isset( $_POST['target_date'] ) ? sanitize_text_field( wp_unslash( $_POST['target_date'] ) ) : '';
		$priority = isset( $_POST['priority'] ) ? (int) $_POST['priority'] : 3;
		$ret_raw = isset( $_POST['expected_return'] ) ? trim( (string) wp_unslash( $_POST['expected_return'] ) ) : '';

		$cats = self::categories();
		if ( ! isset( $cats[ $cat ] ) ) {
			$cat = 'other';
		}
		if ( $priority < 1 || $priority > 5 ) {
			$priority = 3;
		}

		$errors = array();
		if ( strlen( $name ) < 2 ) {
			$errors[] = 'Please give your goal a name.';
		}
		if ( $amount <= 0 ) {
			$errors[] = 'Please enter the amount you need (greater than zero).';
		}
		if ( $savings < 0 || $monthly < 0 ) {
			$errors[] = 'Amounts cannot be negative.';
		}
		$target_store = null;
		if ( '' !== $target ) {
			$ts = strtotime( $target );
			if ( ! $ts ) {
				$errors[] = 'Please enter a valid target date.';
			} elseif ( $ts <= current_time( 'timestamp' ) ) {
				$errors[] = 'Your target date should be in the future.';
			} else {
				$target_store = gmdate( 'Y-m-d', $ts );
			}
		} else {
			$errors[] = 'Please choose a target date.';
		}
		$expected = null;
		if ( '' !== $ret_raw ) {
			if ( ! is_numeric( $ret_raw ) ) {
				$errors[] = 'Expected return must be a number.';
			} else {
				$expected = (float) $ret_raw;
				if ( $expected < 0 || $expected > 40 ) {
					$errors[] = 'Expected return should be between 0 and 40 percent.';
				}
			}
		}

		if ( $errors ) {
			AWIVEST_Auth::instance()->flash( 'error', $errors );
			$redir = $gid ? add_query_arg( 'edit', $gid, $back ) : $back;
			AWIVEST_Auth::go( $redir );
			exit;
		}

		$rate    = ( null !== $expected ) ? $expected : AWIVEST_MSI::member_return( $inv );
		$months  = AWIVEST_MSI_Calculators::months_until( $target_store );
		$proj    = AWIVEST_MSI_Calculators::future_value( $savings, $monthly, $rate, $months );
		$req     = AWIVEST_MSI_Calculators::required_monthly( $amount, $savings, $rate, $months );
		$remain  = max( 0.0, $amount - $savings );
		$prog    = $amount > 0 ? min( 100.0, $proj / $amount * 100 ) : 0.0;
		$prob    = AWIVEST_MSI_Calculators::completion_probability( $proj, $amount, $rate );

		global $wpdb;
		$assessment = AWIVEST_MSI::instance()->latest_assessment( $inv );
		$now        = current_time( 'mysql' );
		$data = array(
			'investor_id'      => $inv->investor_id,
			'goal_name'        => $name,
			'category'         => $cat,
			'amount_needed'    => $amount,
			'current_savings'  => $savings,
			'monthly_contrib'  => $monthly,
			'target_date'      => $target_store,
			'priority'         => $priority,
			'expected_return'  => ( null !== $expected ) ? $expected : $rate,
			'remaining_amount' => round( $remain, 2 ),
			'required_monthly' => round( $req, 2 ),
			'projected_value'  => round( $proj, 2 ),
			'progress_pct'     => round( $prog, 2 ),
			'completion_prob'  => round( $prob, 2 ),
			'updated_at'       => $now,
		);

		if ( $gid && $this->get_goal( $inv, $gid ) ) {
			$wpdb->update( AWIVEST_MSI_Schema::goals(), $data, array( 'id' => $gid, 'investor_id' => $inv->investor_id ) );
			AWIVEST_DB::log( $inv->investor_id, 'msi_goal_update', 'Updated goal #' . $gid );
		} else {
			$data['assessment_id'] = $assessment ? (int) $assessment->id : 0;
			$data['created_at']    = $now;
			$wpdb->insert( AWIVEST_MSI_Schema::goals(), $data );
			AWIVEST_DB::log( $inv->investor_id, 'msi_goal_add', 'Added goal: ' . $name );
		}

		AWIVEST_Auth::instance()->flash( 'success', array( 'Your goal has been saved.' ) );
		AWIVEST_Auth::go( $back );
		exit;
	}

	/* ------------------------------ Rendering ---------------------------- */

	private function money( $v ) {
		$a = AWIVEST_MSI::assumptions();
		return $a['currency'] . ' ' . number_format( (float) $v );
	}

	/** Full goals manager (list + add/edit form) shown under Financial Profile. */
	public function render_manager( $inv ) {
		$goals = $this->get_goals( $inv );
		$cats  = self::categories();
		$edit_id = isset( $_GET['edit'] ) ? (int) $_GET['edit'] : 0;
		$editing = $edit_id ? $this->get_goal( $inv, $edit_id ) : null;

		echo '<div class="awivest-card">';
		echo '<h2>Your Goals</h2>';
		echo '<p class="awivest-hint">Add the things you are saving and investing towards. We show you what each goal needs and how likely you are to reach it, using your AWI planning assumptions.</p>';
		echo '</div>';

		if ( $goals ) {
			foreach ( $goals as $g ) {
				$c   = $this->calc( $g );
				$pct = (int) round( $c['progress'] );
				$prob = (int) round( $c['prob'] );
				echo '<div class="awivest-card awivest-goal">';
				echo '<div class="awivest-goal-head"><h3>' . esc_html( $g->goal_name ) . '</h3><span class="awivest-badge">' . esc_html( isset( $cats[ $g->category ] ) ? $cats[ $g->category ] : $g->category ) . '</span></div>';
				echo '<div class="awivest-msi-progress"><span style="width:' . esc_attr( max( 2, $pct ) ) . '%"></span></div>';
				echo '<div class="awivest-goal-stats">';
				echo '<div><span>Target</span><strong>' . esc_html( $this->money( $g->amount_needed ) ) . '</strong></div>';
				echo '<div><span>Saved so far</span><strong>' . esc_html( $this->money( $g->current_savings ) ) . '</strong></div>';
				echo '<div><span>You contribute</span><strong>' . esc_html( $this->money( $g->monthly_contrib ) ) . '/mo</strong></div>';
				echo '<div><span>Suggested to stay on track</span><strong>' . esc_html( $this->money( $c['required'] ) ) . '/mo</strong></div>';
				echo '<div><span>Projected by target</span><strong>' . esc_html( $this->money( $c['projected'] ) ) . '</strong></div>';
				echo '<div><span>On-track progress</span><strong>' . (int) $pct . '%</strong></div>';
				echo '<div><span>Chance of reaching it</span><strong>' . (int) $prob . '%</strong></div>';
				echo '<div><span>Target date</span><strong>' . esc_html( $g->target_date ? mysql2date( 'M Y', $g->target_date ) : '-' ) . '</strong></div>';
				echo '</div>';
				$edit_url = add_query_arg( array( 'view' => 'msi', 'sub' => 'goals', 'edit' => (int) $g->id ), AWIVEST_Auth::instance()->portal_url() );
				echo '<div class="awivest-goal-actions">';
				echo '<a class="awivest-btn small awivest-btn-outline" href="' . esc_url( $edit_url ) . '">Edit</a> ';
				echo '<form method="post" style="display:inline" onsubmit="return confirm(\'Remove this goal?\');">';
				wp_nonce_field( 'awivest_msi_goal', 'awivest_nonce' );
				echo '<input type="hidden" name="awivest_action" value="msi_goal_delete">';
				echo '<input type="hidden" name="goal_id" value="' . (int) $g->id . '">';
				echo '<button type="submit" class="awivest-btn small awivest-btn-danger">Remove</button>';
				echo '</form>';
				echo '</div>';
				echo '</div>';
			}
		} else {
			echo '<div class="awivest-card"><p>You have not added any goals yet. Add your first goal below - a home, a business, education, retirement, or anything you are working towards.</p></div>';
		}

		// Add / edit form.
		$this->render_form( $inv, $editing );
	}

	private function render_form( $inv, $editing ) {
		$cats  = self::categories();
		$prios = self::priorities();
		$val = function ( $k, $d = '' ) use ( $editing ) {
			return ( $editing && isset( $editing->$k ) && null !== $editing->$k ) ? $editing->$k : $d;
		};
		$title = $editing ? 'Edit goal' : 'Add a goal';

		echo '<div class="awivest-card">';
		echo '<h3>' . esc_html( $title ) . '</h3>';
		echo '<form method="post" class="awivest-form awivest-goal-form">';
		wp_nonce_field( 'awivest_msi_goal', 'awivest_nonce' );
		echo '<input type="hidden" name="awivest_action" value="msi_goal_save">';
		if ( $editing ) {
			echo '<input type="hidden" name="goal_id" value="' . (int) $editing->id . '">';
		}
		echo '<label>Goal name <span class="awivest-req">*</span><input type="text" name="goal_name" value="' . esc_attr( $val( 'goal_name' ) ) . '" required></label>';

		echo '<label>Category<select name="category">';
		$cur_cat = $val( 'category', 'other' );
		foreach ( $cats as $cv => $cl ) {
			echo '<option value="' . esc_attr( $cv ) . '"' . selected( $cur_cat, $cv, false ) . '>' . esc_html( $cl ) . '</option>';
		}
		echo '</select></label>';

		echo '<label>Amount needed (' . esc_html( AWIVEST_MSI::assumptions()['currency'] ) . ') <span class="awivest-req">*</span><input type="number" step="1" min="0" name="amount_needed" value="' . esc_attr( $val( 'amount_needed' ) ) . '" required></label>';
		echo '<label>Saved so far<input type="number" step="1" min="0" name="current_savings" value="' . esc_attr( $val( 'current_savings', '0' ) ) . '"></label>';
		echo '<label>Monthly contribution<input type="number" step="1" min="0" name="monthly_contrib" value="' . esc_attr( $val( 'monthly_contrib', '0' ) ) . '"></label>';
		echo '<label>Target date <span class="awivest-req">*</span><input type="date" name="target_date" value="' . esc_attr( substr( (string) $val( 'target_date' ), 0, 10 ) ) . '" required></label>';

		echo '<label>Priority<select name="priority">';
		$cur_prio = (int) $val( 'priority', 3 );
		foreach ( $prios as $pv => $pl ) {
			echo '<option value="' . (int) $pv . '"' . selected( $cur_prio, $pv, false ) . '>' . esc_html( $pl ) . '</option>';
		}
		echo '</select></label>';

		$def_ret = AWIVEST_MSI::member_return( $inv );
		echo '<label>Expected annual return % (optional)<input type="number" step="0.1" min="0" max="40" name="expected_return" value="' . esc_attr( $val( 'expected_return' ) ) . '" placeholder="' . esc_attr( $def_ret ) . '"></label>';
		echo '<p class="awivest-msi-savenote">These are illustrative planning assumptions, not guaranteed returns. Leave the return blank to use the default (' . esc_html( $def_ret ) . '%).</p>';

		echo '<button type="submit" class="awivest-btn">' . ( $editing ? 'Save changes' : 'Add goal' ) . '</button>';
		if ( $editing ) {
			echo ' <a class="awivest-btn small awivest-btn-outline" href="' . esc_url( add_query_arg( array( 'view' => 'msi', 'sub' => 'goals' ), AWIVEST_Auth::instance()->portal_url() ) ) . '">Cancel</a>';
		}
		echo '</form>';
		echo '</div>';
	}

	/** Compact goals tracker for the dashboard (top 3 by priority). */
	public function render_dashboard_tracker( $inv ) {
		$goals = $this->get_goals( $inv );
		if ( ! $goals ) {
			return;
		}
		$url = add_query_arg( array( 'view' => 'msi', 'sub' => 'goals' ), AWIVEST_Auth::instance()->portal_url() );
		echo '<div class="awivest-card awivest-msi-cta">';
		echo '<h3>Goal tracker</h3>';
		$shown = 0;
		foreach ( $goals as $g ) {
			if ( $shown >= 3 ) {
				break;
			}
			$c   = $this->calc( $g );
			$pct = (int) round( $c['progress'] );
			echo '<div class="awivest-goal-mini">';
			echo '<div class="awivest-goal-mini-top"><span>' . esc_html( $g->goal_name ) . '</span><span>' . (int) $pct . '%</span></div>';
			echo '<div class="awivest-msi-progress"><span style="width:' . esc_attr( max( 2, $pct ) ) . '%"></span></div>';
			echo '</div>';
			$shown++;
		}
		echo '<p style="margin-top:10px"><a class="awivest-btn awivest-btn-outline" href="' . esc_url( $url ) . '">Manage my goals</a></p>';
		echo '</div>';
	}
}
