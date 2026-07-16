<?php
/**
 * MSI financial calculators (v2.11.2 core; expanded into standalone widgets in
 * v2.11.3). Pure, stateless functions used by the goal planner. All monthly-rate
 * maths guard against zero interest and zero terms so shared hosting never trips
 * a divide-by-zero.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_MSI_Calculators {

	/** Annual expected return (%) for a risk profile, from AWI-approved settings. */
	public static function expected_return( $risk_profile = 'balanced' ) {
		$a   = AWIVEST_MSI::assumptions();
		$map = array(
			'conservative' => $a['return_conservative'],
			'moderate'     => $a['return_moderate'],
			'balanced'     => $a['return_balanced'],
			'growth'       => $a['return_growth'],
			'aggressive'   => $a['return_aggressive'],
		);
		$key = strtolower( (string) $risk_profile );
		return isset( $map[ $key ] ) ? (float) $map[ $key ] : (float) $a['return_balanced'];
	}

	/** Future value of a present sum plus fixed monthly contributions. */
	public static function future_value( $present, $monthly, $annual_rate_pct, $months ) {
		$present = (float) $present;
		$monthly = (float) $monthly;
		$n       = max( 0, (int) $months );
		$r       = ( (float) $annual_rate_pct / 100 ) / 12;
		if ( $n <= 0 ) {
			return $present;
		}
		if ( $r <= 0 ) {
			return $present + $monthly * $n;
		}
		$growth = pow( 1 + $r, $n );
		return $present * $growth + $monthly * ( ( $growth - 1 ) / $r );
	}

	/** Monthly contribution needed to reach a target, given a present sum. */
	public static function required_monthly( $target, $present, $annual_rate_pct, $months ) {
		$target  = (float) $target;
		$present = (float) $present;
		$n       = max( 1, (int) $months );
		$r       = ( (float) $annual_rate_pct / 100 ) / 12;
		if ( $r <= 0 ) {
			return max( 0.0, $target - $present ) / $n;
		}
		$growth = pow( 1 + $r, $n );
		$gap    = max( 0.0, $target - $present * $growth );
		$factor = ( $growth - 1 ) / $r;
		return $factor > 0 ? $gap / $factor : 0.0;
	}

	/** Whole months between now and a target date (at least 1). */
	public static function months_until( $target_date ) {
		if ( ! $target_date || '0000-00-00' === substr( (string) $target_date, 0, 10 ) ) {
			return 12;
		}
		$now = current_time( 'timestamp' );
		$t   = strtotime( substr( (string) $target_date, 0, 10 ) . ' 00:00:00' );
		if ( ! $t ) {
			return 12;
		}
		$months = ( (int) gmdate( 'Y', $t ) - (int) gmdate( 'Y', $now ) ) * 12 + ( (int) gmdate( 'n', $t ) - (int) gmdate( 'n', $now ) );
		return max( 1, (int) $months );
	}

	/** Volatility band for a return level (used by completion probability). */
	public static function volatility( $annual_rate_pct ) {
		$s = ( (float) $annual_rate_pct / 100 ) * 1.2;
		if ( $s < 0.05 ) {
			return 0.05;
		}
		if ( $s > 0.25 ) {
			return 0.25;
		}
		return $s;
	}

	/**
	 * Completion probability (0-100): a deterministic, shared-host-friendly
	 * logistic on the projected/target ratio, widened by volatility. Avoids the
	 * server cost of a Monte Carlo simulation while staying intuitive.
	 */
	public static function completion_probability( $projected, $target, $annual_rate_pct ) {
		$target = (float) $target;
		if ( $target <= 0 ) {
			return 100.0;
		}
		$ratio = (float) $projected / $target;
		$sigma = self::volatility( $annual_rate_pct );
		$p     = ( 1 / ( 1 + exp( - ( $ratio - 1 ) / ( 0.15 + $sigma ) ) ) ) * 100;
		if ( $p < 0 ) {
			return 0.0;
		}
		if ( $p > 100 ) {
			return 100.0;
		}
		return $p;
	}

	/**
	 * Present value of a level monthly payout - the lump sum needed today (or at
	 * retirement) to fund a given monthly income for a number of months, at a
	 * drawdown return.
	 */
	public static function annuity_present_value( $monthly_payment, $annual_rate_pct, $months ) {
		$pmt = (float) $monthly_payment;
		$n   = max( 1, (int) $months );
		$r   = ( (float) $annual_rate_pct / 100 ) / 12;
		if ( $r <= 0 ) {
			return $pmt * $n;
		}
		return $pmt * ( ( 1 - pow( 1 + $r, - $n ) ) / $r );
	}

	/** Compound a present amount forward by an annual rate over whole years. */
	public static function compound( $amount, $annual_rate_pct, $years ) {
		$y = max( 0, (int) $years );
		return (float) $amount * pow( 1 + ( (float) $annual_rate_pct / 100 ), $y );
	}

	/** Purchasing power today of a future amount, discounted by inflation. */
	public static function real_value( $amount, $inflation_pct, $years ) {
		$y = max( 0, (int) $years );
		$f = pow( 1 + ( (float) $inflation_pct / 100 ), $y );
		return $f > 0 ? (float) $amount / $f : (float) $amount;
	}
}
