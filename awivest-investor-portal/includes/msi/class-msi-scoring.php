<?php
/**
 * MSI scoring engine - Financial Wellness Score (v2.11.1).
 *
 * Reads a member's answers for an assessment, computes the sub-scores and the
 * weighted Financial Wellness Score (0-100), plus net worth and estimated
 * monthly investment capacity, and stores them in the scores table.
 *
 * Sub-scores that need data not yet captured in Phase 1 profile steps
 * (diversification, retirement, insurance) return null and are treated as "not
 * yet available": their weight is redistributed across the sub-scores that CAN
 * be computed, so the headline score stays fair. As later increments add those
 * questions, the sub-scores light up automatically.
 *
 * All formulas guard against divide-by-zero and clamp to the range 0..100.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_MSI_Scoring {

	/** Default weights (admin-tunable later). Keys map to sub-scores. */
	public static function weights() {
		return array(
			'emergency'        => 15,
			'savings'          => 15,
			'debt'             => 15,
			'investment'       => 15,
			'diversification'  => 10,
			'retirement'       => 10,
			'insurance'        => 10,
			'income_stability' => 10,
		);
	}

	/** Representative monthly income (KES) for each income bucket. */
	public static function income_midpoint( $bucket ) {
		$map = array(
			'u25k'     => 20000,
			'25-50k'   => 37500,
			'50-100k'  => 75000,
			'100-250k' => 175000,
			'250-500k' => 375000,
			'o500k'    => 600000,
		);
		return isset( $map[ $bucket ] ) ? (float) $map[ $bucket ] : 0.0;
	}

	/** Salary-multiple retirement target multiplier by age (for later use). */
	public static function retirement_multiplier( $age ) {
		$age = (int) $age;
		if ( $age < 30 ) {
			return 0.5;
		}
		if ( $age < 40 ) {
			return 1.5;
		}
		if ( $age < 50 ) {
			return 3.0;
		}
		if ( $age < 60 ) {
			return 5.0;
		}
		return 8.0;
	}

	private static function clamp( $v ) {
		if ( $v < 0 ) {
			return 0.0;
		}
		if ( $v > 100 ) {
			return 100.0;
		}
		return (float) $v;
	}

	/** Load the answer map (field_key => array text/num) for an assessment. */
	public static function answers( $assessment_id ) {
		global $wpdb;
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				'SELECT field_key, value_text, value_num FROM ' . AWIVEST_MSI_Schema::responses() . ' WHERE assessment_id = %d',
				$assessment_id
			)
		);
		$out = array();
		if ( $rows ) {
			foreach ( $rows as $r ) {
				$out[ $r->field_key ] = array( 'text' => $r->value_text, 'num' => $r->value_num );
			}
		}
		return $out;
	}

	private static function num( $ans, $key ) {
		if ( isset( $ans[ $key ] ) && null !== $ans[ $key ]['num'] && '' !== $ans[ $key ]['num'] ) {
			return (float) $ans[ $key ]['num'];
		}
		return null;
	}

	private static function text( $ans, $key ) {
		return isset( $ans[ $key ] ) ? (string) $ans[ $key ]['text'] : '';
	}

	/** Parse a multiselect answer (comma-joined option keys) into a token list. */
	private static function mset( $ans, $key ) {
		$t = self::text( $ans, $key );
		if ( '' === $t ) {
			return array();
		}
		$out = array();
		foreach ( explode( ',', $t ) as $p ) {
			$p = trim( $p );
			if ( '' !== $p ) {
				$out[] = $p;
			}
		}
		return $out;
	}

	/** Map a normalised risk score (4-16) to an AWI risk profile tier. */
	public static function risk_tier( $raw ) {
		$raw = (int) $raw;
		if ( $raw <= 6 ) {
			return 'conservative';
		}
		if ( $raw <= 9 ) {
			return 'moderate';
		}
		if ( $raw <= 12 ) {
			return 'balanced';
		}
		if ( $raw <= 14 ) {
			return 'growth';
		}
		return 'aggressive';
	}

	/**
	 * Compute all scores for an assessment, persist them, and return the result
	 * array (subscores map carries null for not-yet-available items).
	 */
	public static function compute( $assessment ) {
		$ans = self::answers( $assessment->id );

		$income   = self::income_midpoint( self::text( $ans, 'monthly_income_range' ) );
		$expenses = self::num( $ans, 'monthly_expenses' );
		$savings  = self::num( $ans, 'monthly_savings' );
		$emerg    = self::num( $ans, 'emergency_fund' );
		$cur_sav  = self::num( $ans, 'current_savings' );
		$cur_inv  = self::num( $ans, 'current_investments' );
		$assets   = self::num( $ans, 'assets' );
		$liab     = self::num( $ans, 'liabilities' );

		$sub = array(
			'emergency'        => null,
			'savings'          => null,
			'debt'             => null,
			'investment'       => null,
			'diversification'  => null,
			'retirement'       => null,
			'insurance'        => null,
			'income_stability' => null,
		);

		// Net worth (estimate): assets + savings + investments - liabilities.
		$net_worth = 0.0;
		foreach ( array( $assets, $cur_sav, $cur_inv ) as $p ) {
			if ( null !== $p ) {
				$net_worth += $p;
			}
		}
		if ( null !== $liab ) {
			$net_worth -= $liab;
		}

		// Emergency fund: months of expenses covered (target 6).
		if ( null !== $emerg && null !== $expenses && $expenses > 0 ) {
			$sub['emergency'] = self::clamp( ( $emerg / $expenses ) / 6 * 100 );
		}

		// Savings rate (target 20% of income).
		if ( null !== $savings && $income > 0 ) {
			$sub['savings'] = self::clamp( ( $savings / $income ) / 0.20 * 100 );
		}

		// Debt: prefer debt-to-assets, else debt-to-annual-income (2x = 0).
		if ( null !== $liab ) {
			if ( null !== $assets && $assets > 0 ) {
				$sub['debt'] = self::clamp( 100 - ( $liab / $assets ) * 100 );
			} elseif ( $income > 0 ) {
				$sub['debt'] = self::clamp( 100 - ( $liab / ( $income * 12 * 2 ) ) * 100 );
			} elseif ( 0.0 === (float) $liab ) {
				$sub['debt'] = 100.0;
			}
		}

		// Investment: invested share of net worth (target 50%).
		if ( null !== $cur_inv && $net_worth > 0 ) {
			$sub['investment'] = self::clamp( ( $cur_inv / $net_worth ) / 0.5 * 100 );
		}

		// Income stability: employment type + self-reported steadiness.
		$emp_map  = array( 'permanent' => 100, 'contract' => 75, 'self' => 70, 'retired' => 60, 'gig' => 40, 'student' => 30, 'between' => 10 );
		$stab_map = array( 'very' => 100, 'mostly' => 70, 'irregular' => 40 );
		$emp      = self::text( $ans, 'employment_status' );
		$stab     = self::text( $ans, 'income_stability' );
		$parts    = array();
		if ( isset( $emp_map[ $emp ] ) ) {
			$parts[] = $emp_map[ $emp ];
		}
		if ( isset( $stab_map[ $stab ] ) ) {
			$parts[] = $stab_map[ $stab ];
		}
		if ( $parts ) {
			$sub['income_stability'] = self::clamp( array_sum( $parts ) / count( $parts ) );
		}

		// Diversification: number of distinct investment types held (target 4+).
		$inv_types = self::mset( $ans, 'investment_types' );
		if ( $inv_types ) {
			$distinct = count( array_unique( $inv_types ) );
			$sub['diversification'] = self::clamp( $distinct / 4 * 100 );
		}

		// Insurance: breadth of protection held.
		$ins = self::mset( $ans, 'insurance_types' );
		if ( $ins ) {
			if ( in_array( 'none', $ins, true ) && 1 === count( $ins ) ) {
				$sub['insurance'] = 0.0;
			} else {
				$isc = 0;
				if ( in_array( 'health', $ins, true ) ) {
					$isc += 45;
				}
				if ( in_array( 'life', $ins, true ) ) {
					$isc += 35;
				}
				foreach ( array( 'education', 'disability', 'property' ) as $extra ) {
					if ( in_array( $extra, $ins, true ) ) {
						$isc += 20;
						break;
					}
				}
				$sub['insurance'] = self::clamp( $isc );
			}
		}

		// Retirement: having a plan plus progress toward a salary-multiple target.
		$has_plan = self::text( $ans, 'has_retirement_plan' );
		$ret_sav  = self::num( $ans, 'retirement_savings' );
		$age      = self::num( $ans, 'age' );
		if ( '' !== $has_plan || null !== $ret_sav ) {
			$base = 0.0;
			if ( 'yes' === $has_plan ) {
				$base = 40.0;
			} elseif ( 'not_sure' === $has_plan ) {
				$base = 15.0;
			}
			$progress = 0.0;
			if ( null !== $ret_sav && $age && $income > 0 ) {
				$target = self::retirement_multiplier( $age ) * $income * 12;
				if ( $target > 0 ) {
					$progress = min( 60.0, $ret_sav / $target * 60 );
				}
			} elseif ( null !== $ret_sav && $ret_sav > 0 ) {
				$progress = 20.0;
			}
			$sub['retirement'] = self::clamp( $base + $progress );
		}

		// Risk profile from the risk-appetite questions (average of answered, scaled 4-16).
		$risk_maps = array(
			'risk_reaction'   => array( 'sell_all' => 1, 'sell_some' => 2, 'hold' => 3, 'buy_more' => 4 ),
			'risk_pref'       => array( 'safe' => 1, 'steady' => 2, 'higher' => 3, 'max' => 4 ),
			'risk_experience' => array( 'none' => 1, 'some' => 2, 'experienced' => 3, 'expert' => 4 ),
			'risk_capacity'   => array( 'severe' => 1, 'significant' => 2, 'manageable' => 3, 'minimal' => 4 ),
		);
		$risk_pts = array();
		foreach ( $risk_maps as $rk => $rmap ) {
			$rv = self::text( $ans, $rk );
			if ( isset( $rmap[ $rv ] ) ) {
				$risk_pts[] = $rmap[ $rv ];
			}
		}
		$risk_profile = '';
		$risk_raw     = 0;
		if ( $risk_pts ) {
			$avg          = array_sum( $risk_pts ) / count( $risk_pts );
			$risk_raw     = (int) round( $avg * 4 );
			$risk_profile = self::risk_tier( $risk_raw );
		}

		// Weighted total, redistributing over available sub-scores.
		$acc  = 0.0;
		$wsum = 0.0;
		foreach ( self::weights() as $k => $w ) {
			if ( null !== $sub[ $k ] ) {
				$acc  += $sub[ $k ] * $w;
				$wsum += $w;
			}
		}
		$total = $wsum > 0 ? (int) round( $acc / $wsum ) : 0;

		// Estimated monthly investment capacity.
		$capacity = 0.0;
		if ( null !== $expenses && $income > 0 ) {
			$capacity = max( 0.0, $income - $expenses );
		} elseif ( null !== $savings ) {
			$capacity = max( 0.0, $savings );
		}

		$as_int = function ( $v ) {
			return null === $v ? 0 : (int) round( $v );
		};

		$mcis = AWIVEST_MSI_MCIS::compute(
			$assessment,
			array(
				'answers'      => $ans,
				'income'       => $income,
				'capacity'     => $capacity,
				'net_worth'    => $net_worth,
				'risk_profile' => $risk_profile,
			)
		);

		$row = array(
			'assessment_id'          => (int) $assessment->id,
			'investor_id'            => $assessment->investor_id,
			'wellness_total'         => $total,
			'savings_score'          => $as_int( $sub['savings'] ),
			'debt_score'             => $as_int( $sub['debt'] ),
			'investment_score'       => $as_int( $sub['investment'] ),
			'insurance_score'        => $as_int( $sub['insurance'] ),
			'emergency_score'        => $as_int( $sub['emergency'] ),
			'income_stability_score' => $as_int( $sub['income_stability'] ),
			'diversification_score'  => $as_int( $sub['diversification'] ),
			'retirement_score'       => $as_int( $sub['retirement'] ),
			'risk_profile'           => $risk_profile,
			'risk_raw'               => $risk_raw,
			'segment_primary'        => $mcis['segment_primary'],
			'segment_secondary'      => $mcis['segment_secondary'],
			'mcis_score'             => $mcis['mcis_score'],
			'mcis_tier'              => $mcis['mcis_tier'],
			'net_worth'              => round( $net_worth, 2 ),
			'investment_capacity'    => round( $capacity, 2 ),
			'computed_at'            => current_time( 'mysql' ),
		);

		global $wpdb;
		$table  = AWIVEST_MSI_Schema::scores();
		$exists = $wpdb->get_var( $wpdb->prepare( "SELECT assessment_id FROM {$table} WHERE assessment_id = %d", $assessment->id ) );
		if ( $exists ) {
			$wpdb->update( $table, $row, array( 'assessment_id' => (int) $assessment->id ) );
		} else {
			$wpdb->insert( $table, $row );
		}

		return array(
			'total'        => $total,
			'band'         => self::band( $total ),
			'subscores'    => $sub,
			'net_worth'    => $net_worth,
			'capacity'     => $capacity,
			'risk_profile' => $risk_profile,
			'risk_raw'     => $risk_raw,
			'mcis'         => $mcis,
		);
	}

	public static function band( $total ) {
		$total = (int) $total;
		if ( $total >= 80 ) {
			return 'Excellent';
		}
		if ( $total >= 60 ) {
			return 'Good';
		}
		if ( $total >= 40 ) {
			return 'Average';
		}
		return 'Needs Improvement';
	}

	/** Human labels for sub-scores (results screen). */
	public static function subscore_labels() {
		return array(
			'emergency'        => 'Emergency fund',
			'savings'          => 'Savings rate',
			'debt'             => 'Debt',
			'investment'       => 'Investing',
			'diversification'  => 'Diversification',
			'retirement'       => 'Retirement',
			'insurance'        => 'Insurance',
			'income_stability' => 'Income stability',
		);
	}
}
