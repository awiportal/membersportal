<?php
/**
 * MSI standalone planning calculators (v2.11.3).
 *
 * Four member-facing tools - retirement, investment growth, goal/SIP and
 * inflation impact - rendered under a "Planning Tools" portal view. They are
 * stateless: forms submit by GET to the same page, the widget reads the values
 * and shows illustrative results. No JavaScript is required, so they work on any
 * phone, and no data is stored. All figures use AWIVEST_MSI_Calculators and the
 * AWI-approved planning assumptions, and are clearly labelled as estimates.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_MSI_Calc_Widgets {

	private static $instance = null;
	private $def_return = 12.0;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {}

	private function tabs() {
		return array(
			'retirement' => 'Retirement',
			'growth'     => 'Investment Growth',
			'goal'       => 'Goal / SIP',
			'inflation'  => 'Inflation Impact',
		);
	}

	/** Read a numeric GET value, falling back to a default. */
	private function fget( $key, $default ) {
		if ( ! isset( $_GET[ $key ] ) ) {
			return $default;
		}
		$v = wp_unslash( $_GET[ $key ] );
		return is_numeric( $v ) ? (float) $v : $default;
	}

	private function submitted() {
		return isset( $_GET['calc_go'] );
	}

	private function money( $v ) {
		$a = AWIVEST_MSI::assumptions();
		return $a['currency'] . ' ' . number_format( (float) round( $v ) );
	}

	private function pct( $v ) {
		return rtrim( rtrim( number_format( (float) $v, 1 ), '0' ), '.' ) . '%';
	}

	/* ------------------------------ Router ------------------------------- */

	public function render_view( $inv ) {
		if ( ! $inv || 'active' !== $inv->status ) {
			echo '<div class="awivest-card"><h2>Planning Tools</h2><p>These planning calculators become available once your membership is approved.</p></div>';
			return;
		}

		$this->def_return = AWIVEST_MSI::member_return( $inv );

		$tabs = $this->tabs();
		$calc = isset( $_GET['calc'] ) ? sanitize_key( wp_unslash( $_GET['calc'] ) ) : 'retirement';
		if ( ! isset( $tabs[ $calc ] ) ) {
			$calc = 'retirement';
		}

		echo '<div class="awivest-card"><h2>Planning Tools</h2>';
		echo '<p class="awivest-hint">Free calculators to help you plan. Every result uses the AWIVEST planning assumptions and is an illustrative estimate - not a guaranteed return, and not financial advice.</p></div>';

		echo '<div class="awivest-msi-subnav">';
		foreach ( $tabs as $k => $label ) {
			$url = add_query_arg( array( 'view' => 'tools', 'calc' => $k ), AWIVEST_Auth::instance()->portal_url() );
			echo '<a href="' . esc_url( $url ) . '" class="' . ( $calc === $k ? 'is-active' : '' ) . '">' . esc_html( $label ) . '</a>';
		}
		echo '</div>';

		switch ( $calc ) {
			case 'growth':
				$this->calc_growth();
				break;
			case 'goal':
				$this->calc_goal();
				break;
			case 'inflation':
				$this->calc_inflation();
				break;
			default:
				$this->calc_retirement();
				break;
		}
	}

	/* --------------------------- Form helpers ---------------------------- */

	private function form_open( $calc ) {
		echo '<form method="get" class="awivest-form awivest-calc-form" action="' . esc_url( AWIVEST_Auth::instance()->portal_url() ) . '">';
		echo '<input type="hidden" name="view" value="tools">';
		echo '<input type="hidden" name="calc" value="' . esc_attr( $calc ) . '">';
		echo '<input type="hidden" name="calc_go" value="1">';
	}

	private function num_field( $label, $name, $value, $step = '1', $min = '0', $suffix = '' ) {
		echo '<label>' . esc_html( $label );
		echo '<span class="awivest-calc-inputwrap"><input type="number" step="' . esc_attr( $step ) . '" min="' . esc_attr( $min ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( $value ) . '">';
		if ( '' !== $suffix ) {
			echo '<span class="awivest-msi-unit-suffix">' . esc_html( $suffix ) . '</span>';
		}
		echo '</span></label>';
	}

	private function result_row( $label, $value, $strong = false ) {
		echo '<div class="awivest-calc-row' . ( $strong ? ' is-strong' : '' ) . '"><span>' . esc_html( $label ) . '</span><strong>' . esc_html( $value ) . '</strong></div>';
	}

	private function disclaimer() {
		echo '<p class="awivest-msi-savenote">Illustrative estimate only, based on the AWIVEST planning assumptions. Real returns vary and are not guaranteed. This is not financial advice.</p>';
	}

	/* ---------------------------- Retirement ----------------------------- */

	private function calc_retirement() {
		$a         = AWIVEST_MSI::assumptions();
		$def_ret   = $this->def_return;
		$draw_ret  = (float) $a['return_conservative'];
		$inflation = (float) $a['inflation'];

		$cur_age   = (int) $this->fget( 'r_cur_age', 30 );
		$ret_age   = (int) $this->fget( 'r_ret_age', 60 );
		$savings   = $this->fget( 'r_savings', 0 );
		$monthly   = $this->fget( 'r_monthly', 5000 );
		$ret_pct   = $this->fget( 'r_return', $def_ret );
		$income    = $this->fget( 'r_income', 50000 );
		$years_ret = (int) $this->fget( 'r_years_ret', 25 );

		echo '<div class="awivest-card">';
		echo '<h3>Retirement calculator</h3>';
		echo '<p class="awivest-hint">See whether your current saving is on track for the monthly income you want in retirement.</p>';
		$this->form_open( 'retirement' );
		$this->num_field( 'Your age now', 'r_cur_age', $cur_age, '1', '18' );
		$this->num_field( 'Planned retirement age', 'r_ret_age', $ret_age, '1', '19' );
		$this->num_field( 'Retirement savings so far', 'r_savings', $savings );
		$this->num_field( 'Monthly contribution', 'r_monthly', $monthly );
		$this->num_field( 'Expected annual return', 'r_return', $ret_pct, '0.1', '0', '%' );
		$this->num_field( 'Monthly income you want (today\'s money)', 'r_income', $income );
		$this->num_field( 'Years the income must last', 'r_years_ret', $years_ret, '1', '1' );
		echo '<button type="submit" class="awivest-btn">Calculate</button>';
		echo '</form>';

		if ( $this->submitted() ) {
			if ( $ret_age <= $cur_age ) {
				echo '<div class="awivest-notice awivest-notice-error">Your retirement age should be greater than your current age.</div>';
			} else {
				$years_to  = $ret_age - $cur_age;
				$months_to = $years_to * 12;
				$projected = AWIVEST_MSI_Calculators::future_value( $savings, $monthly, $ret_pct, $months_to );
				$income_fut = AWIVEST_MSI_Calculators::compound( $income, $inflation, $years_to );
				$needed    = AWIVEST_MSI_Calculators::annuity_present_value( $income_fut, $draw_ret, $years_ret * 12 );
				$req_total = AWIVEST_MSI_Calculators::required_monthly( $needed, $savings, $ret_pct, $months_to );
				$on_track  = $projected >= $needed;

				echo '<div class="awivest-card awivest-calc-result">';
				echo '<h4>Your retirement outlook</h4>';
				$this->result_row( 'Years until retirement', $years_to . ' years' );
				$this->result_row( 'Projected savings at retirement', $this->money( $projected ), true );
				$this->result_row( 'Income you want, in ' . $years_to . ' years (adjusted for ' . $this->pct( $inflation ) . ' inflation)', $this->money( $income_fut ) . '/mo' );
				$this->result_row( 'Pot needed to fund that income for ' . $years_ret . ' years', $this->money( $needed ), true );
				if ( $on_track ) {
					echo '<div class="awivest-notice awivest-notice-ok">On current plans you are on track - your projected savings meet the pot you need. Keeping it up, or investing any surplus, builds a cushion.</div>';
				} else {
					$this->result_row( 'Shortfall', $this->money( max( 0, $needed - $projected ) ) );
					$this->result_row( 'Suggested total monthly to close the gap', $this->money( $req_total ), true );
				}
				$this->disclaimer();
				echo '</div>';
			}
		}
		echo '</div>';
	}

	/* ------------------------- Investment growth ------------------------- */

	private function calc_growth() {
		$a         = AWIVEST_MSI::assumptions();
		$def_ret   = $this->def_return;
		$inflation = (float) $a['inflation'];

		$initial = $this->fget( 'g_initial', 50000 );
		$monthly = $this->fget( 'g_monthly', 5000 );
		$ret_pct = $this->fget( 'g_return', $def_ret );
		$years   = (int) $this->fget( 'g_years', 10 );

		echo '<div class="awivest-card">';
		echo '<h3>Investment growth calculator</h3>';
		echo '<p class="awivest-hint">See how a starting amount plus regular monthly investing could grow over time.</p>';
		$this->form_open( 'growth' );
		$this->num_field( 'Starting amount', 'g_initial', $initial );
		$this->num_field( 'Monthly contribution', 'g_monthly', $monthly );
		$this->num_field( 'Expected annual return', 'g_return', $ret_pct, '0.1', '0', '%' );
		$this->num_field( 'Number of years', 'g_years', $years, '1', '1' );
		echo '<button type="submit" class="awivest-btn">Calculate</button>';
		echo '</form>';

		if ( $this->submitted() ) {
			$months      = $years * 12;
			$fv          = AWIVEST_MSI_Calculators::future_value( $initial, $monthly, $ret_pct, $months );
			$contributed = $initial + $monthly * $months;
			$growth      = max( 0, $fv - $contributed );
			$real        = AWIVEST_MSI_Calculators::real_value( $fv, $inflation, $years );

			echo '<div class="awivest-card awivest-calc-result">';
			echo '<h4>Projected value in ' . (int) $years . ' years</h4>';
			$this->result_row( 'Future value', $this->money( $fv ), true );
			$this->result_row( 'Total you will have contributed', $this->money( $contributed ) );
			$this->result_row( 'Estimated growth earned', $this->money( $growth ), true );
			$this->result_row( 'Value in today\'s money (after ' . $this->pct( $inflation ) . ' inflation)', $this->money( $real ) );
			$this->disclaimer();
			echo '</div>';
		}
		echo '</div>';
	}

	/* ----------------------------- Goal / SIP ---------------------------- */

	private function calc_goal() {
		$def_ret = $this->def_return;

		$target  = $this->fget( 'goal_target', 1000000 );
		$savings = $this->fget( 'goal_savings', 0 );
		$years   = (int) $this->fget( 'goal_years', 5 );
		$ret_pct = $this->fget( 'goal_return', $def_ret );

		echo '<div class="awivest-card">';
		echo '<h3>Goal / SIP calculator</h3>';
		echo '<p class="awivest-hint">Find the monthly amount (a systematic investment plan) needed to reach a target by a chosen date.</p>';
		$this->form_open( 'goal' );
		$this->num_field( 'Target amount', 'goal_target', $target );
		$this->num_field( 'Saved so far', 'goal_savings', $savings );
		$this->num_field( 'Years to reach it', 'goal_years', $years, '1', '1' );
		$this->num_field( 'Expected annual return', 'goal_return', $ret_pct, '0.1', '0', '%' );
		echo '<button type="submit" class="awivest-btn">Calculate</button>';
		echo '</form>';

		if ( $this->submitted() ) {
			$months   = $years * 12;
			$required = AWIVEST_MSI_Calculators::required_monthly( $target, $savings, $ret_pct, $months );
			$grown    = AWIVEST_MSI_Calculators::future_value( $savings, 0, $ret_pct, $months );
			$gap      = max( 0, $target - $grown );

			echo '<div class="awivest-card awivest-calc-result">';
			echo '<h4>To reach ' . esc_html( $this->money( $target ) ) . ' in ' . (int) $years . ' years</h4>';
			$this->result_row( 'Suggested monthly investment', $this->money( $required ), true );
			$this->result_row( 'What your current savings alone grow to', $this->money( $grown ) );
			$this->result_row( 'Gap the monthly investment needs to cover', $this->money( $gap ) );
			$this->disclaimer();
			echo '</div>';
		}
		echo '</div>';
	}

	/* --------------------------- Inflation ------------------------------- */

	private function calc_inflation() {
		$a       = AWIVEST_MSI::assumptions();
		$def_inf = (float) $a['inflation'];

		$amount = $this->fget( 'inf_amount', 100000 );
		$years  = (int) $this->fget( 'inf_years', 10 );
		$rate   = $this->fget( 'inf_rate', $def_inf );

		echo '<div class="awivest-card">';
		echo '<h3>Inflation impact calculator</h3>';
		echo '<p class="awivest-hint">See how rising prices affect the cost of things - and the buying power of cash - over time.</p>';
		$this->form_open( 'inflation' );
		$this->num_field( 'Amount today', 'inf_amount', $amount );
		$this->num_field( 'Number of years', 'inf_years', $years, '1', '1' );
		$this->num_field( 'Assumed inflation rate', 'inf_rate', $rate, '0.1', '0', '%' );
		echo '<button type="submit" class="awivest-btn">Calculate</button>';
		echo '</form>';

		if ( $this->submitted() ) {
			$future_cost = AWIVEST_MSI_Calculators::compound( $amount, $rate, $years );
			$real_power  = AWIVEST_MSI_Calculators::real_value( $amount, $rate, $years );

			echo '<div class="awivest-card awivest-calc-result">';
			echo '<h4>In ' . (int) $years . ' years, at ' . esc_html( $this->pct( $rate ) ) . ' inflation</h4>';
			$this->result_row( 'Something costing ' . $this->money( $amount ) . ' today will cost about', $this->money( $future_cost ), true );
			$this->result_row( esc_html( $this->money( $amount ) ) . ' kept as cash will have the buying power of about', $this->money( $real_power ), true );
			echo '<p class="awivest-msi-savenote">This is why investing to beat inflation matters: cash left idle loses buying power over time. Illustrative only, not advice.</p>';
			echo '</div>';
		}
		echo '</div>';
	}
}
