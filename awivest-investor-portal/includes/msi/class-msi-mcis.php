<?php
/**
 * MSI Member Commitment & Investment Intent Score (MCIS) - blueprint Section 11A.
 *
 * A second scoring axis (separate from Financial Wellness and the risk profile)
 * that gauges how committed and investment-ready a member is, expressed as a
 * 0-100 score and mapped onto a seven-tier ladder: Explorer -> Starter ->
 * Builder -> Committed -> Investor -> Champion -> Strategic Partner.
 *
 * It also derives two membership segments (a life-stage primary segment and a
 * financial-standing secondary segment) for admin analytics later. Everything is
 * computed from data already captured in the profile and goals - no new tables
 * (the scores table already carries mcis_score, mcis_tier, segment_primary and
 * segment_secondary).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_MSI_MCIS {

	/** The seven-tier commitment ladder, lowest first. */
	public static function tiers() {
		return array(
			array( 'key' => 'explorer',  'label' => 'Explorer',          'min' => 0,  'desc' => 'Just getting to know AWIVEST and your finances.' ),
			array( 'key' => 'starter',   'label' => 'Starter',           'min' => 15, 'desc' => 'Taking your first steps towards investing.' ),
			array( 'key' => 'builder',   'label' => 'Builder',           'min' => 30, 'desc' => 'Actively building savings and good habits.' ),
			array( 'key' => 'committed', 'label' => 'Committed',         'min' => 45, 'desc' => 'Clear goals and steady contributions.' ),
			array( 'key' => 'investor',  'label' => 'Investor',          'min' => 60, 'desc' => 'Investing regularly, with real intent.' ),
			array( 'key' => 'champion',  'label' => 'Champion',          'min' => 75, 'desc' => 'A committed, diversified investor.' ),
			array( 'key' => 'partner',   'label' => 'Strategic Partner', 'min' => 90, 'desc' => 'Deeply engaged - a long-term partner of AWIVEST.' ),
		);
	}

	/** Tier definition for a score (highest tier whose minimum is met). */
	public static function tier_for( $score ) {
		$score = (int) $score;
		$out   = self::tiers();
		$out   = $out[0];
		foreach ( self::tiers() as $t ) {
			if ( $score >= $t['min'] ) {
				$out = $t;
			}
		}
		return $out;
	}

	/** Zero-based position of a tier key on the ladder. */
	public static function tier_index( $key ) {
		$i = 0;
		foreach ( self::tiers() as $t ) {
			if ( $t['key'] === $key ) {
				return $i;
			}
			$i++;
		}
		return 0;
	}

	/** Short description for a tier key. */
	public static function tier_desc_for( $key ) {
		foreach ( self::tiers() as $t ) {
			if ( $t['key'] === $key ) {
				return $t['desc'];
			}
		}
		return '';
	}

	/**
	 * Compute MCIS + segments. $ctx carries answers (map), income, capacity,
	 * net_worth and risk_profile from the scoring pass.
	 */
	public static function compute( $assessment, $ctx ) {
		$ans      = isset( $ctx['answers'] ) ? $ctx['answers'] : array();
		$income   = isset( $ctx['income'] ) ? (float) $ctx['income'] : 0.0;
		$capacity = isset( $ctx['capacity'] ) ? (float) $ctx['capacity'] : 0.0;
		$net      = isset( $ctx['net_worth'] ) ? (float) $ctx['net_worth'] : 0.0;

		$text = function ( $k ) use ( $ans ) {
			return isset( $ans[ $k ] ) ? (string) $ans[ $k ]['text'] : '';
		};
		$num = function ( $k ) use ( $ans ) {
			return ( isset( $ans[ $k ] ) && null !== $ans[ $k ]['num'] && '' !== (string) $ans[ $k ]['num'] ) ? (float) $ans[ $k ]['num'] : null;
		};

		// Goals: count and total monthly contribution for this member.
		$goals_count   = 0;
		$goals_contrib = 0.0;
		if ( ! empty( $assessment->investor_id ) ) {
			global $wpdb;
			$g = $wpdb->get_row(
				$wpdb->prepare(
					'SELECT COUNT(*) AS c, COALESCE(SUM(monthly_contrib),0) AS s FROM ' . AWIVEST_MSI_Schema::goals() . ' WHERE investor_id = %s',
					$assessment->investor_id
				)
			);
			if ( $g ) {
				$goals_count   = (int) $g->c;
				$goals_contrib = (float) $g->s;
			}
		}

		// Profile completion (max 20).
		$reg_total = count( AWIVEST_MSI_Fields::registry() );
		$answered  = 0;
		foreach ( $ans as $k => $v ) {
			if ( '' !== trim( (string) $v['text'] ) ) {
				$answered++;
			}
		}
		$completion = $reg_total > 0 ? min( 20.0, $answered / $reg_total * 20 ) : 0.0;

		// Investment capacity vs income (max 20; 30% of income = full marks).
		$cap_pts = 0.0;
		if ( $income > 0 ) {
			$cap_pts = min( 20.0, ( $capacity / $income ) / 0.30 * 20 );
		} elseif ( $capacity > 0 ) {
			$cap_pts = 10.0;
		}

		// Goal commitment (max 25): up to 15 for having goals, up to 10 for funding them.
		$goal_pts = min( 15.0, $goals_count * 5 );
		if ( $goals_contrib > 0 ) {
			if ( $income > 0 ) {
				$goal_pts += min( 10.0, ( $goals_contrib / $income ) / 0.15 * 10 );
			} else {
				$goal_pts += 5.0;
			}
		}
		$goal_pts = min( 25.0, $goal_pts );

		// Time horizon (max 15).
		$hmap    = array( 'u1' => 3, '1-3' => 6, '3-5' => 9, '5-10' => 12, 'o10' => 15 );
		$hk      = $text( 'investment_horizon' );
		$hor_pts = isset( $hmap[ $hk ] ) ? (float) $hmap[ $hk ] : 0.0;

		// Active investing (max 20): breadth of holdings + any current investment value.
		$inv_pts = 0.0;
		$types   = $text( 'investment_types' );
		if ( '' !== $types ) {
			$cnt = 0;
			foreach ( explode( ',', $types ) as $p ) {
				if ( '' !== trim( $p ) ) {
					$cnt++;
				}
			}
			$inv_pts += min( 12.0, $cnt * 3 );
		}
		$cur_inv = $num( 'current_investments' );
		if ( null !== $cur_inv && $cur_inv > 0 ) {
			$inv_pts += 8.0;
		}
		$inv_pts = min( 20.0, $inv_pts );

		$score = (int) round( $completion + $cap_pts + $goal_pts + $hor_pts + $inv_pts );
		if ( $score < 0 ) {
			$score = 0;
		}
		if ( $score > 100 ) {
			$score = 100;
		}
		$tier = self::tier_for( $score );

		$age = $num( 'age' );

		return array(
			'mcis_score'        => $score,
			'mcis_tier'         => $tier['label'],
			'mcis_tier_key'     => $tier['key'],
			'segment_primary'   => self::segment_primary( $age, $net ),
			'segment_secondary' => self::segment_secondary( $net ),
			'goals_count'       => $goals_count,
		);
	}

	/** Life-stage segment from age (falls back to standing when age unknown). */
	public static function segment_primary( $age, $net_worth ) {
		if ( null !== $age && $age > 0 ) {
			if ( $age < 35 ) {
				return 'Young Builder';
			}
			if ( $age < 50 ) {
				return 'Family Builder';
			}
			if ( $age < 60 ) {
				return 'Pre-Retiree';
			}
			return 'Retiree';
		}
		return ( $net_worth >= 1000000 ) ? 'Established Investor' : 'Emerging Saver';
	}

	/** Financial-standing segment from estimated net worth (KES). */
	public static function segment_secondary( $net_worth ) {
		if ( $net_worth >= 5000000 ) {
			return 'Established Investor';
		}
		if ( $net_worth >= 1000000 ) {
			return 'Wealth Builder';
		}
		if ( $net_worth >= 100000 ) {
			return 'Growing Saver';
		}
		return 'Emerging Saver';
	}
}
