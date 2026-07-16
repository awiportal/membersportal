<?php
/**
 * MSI recommendations engine (v2.11.5).
 *
 * Turns a member's full profile - Financial Wellness sub-scores, risk profile,
 * goals, investment capacity and preferences - into a short, prioritised list of
 * plain-language next steps, including risk-appropriate product ideas. Rules are
 * deterministic and shared-host friendly; nothing here is financial advice and
 * every suggestion is framed as guidance.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_MSI_Recommendations {

	/**
	 * Build a prioritised recommendation list. $ctx: sub (wellness sub-scores),
	 * answers (map), risk_profile, capacity, goals_count, currency.
	 */
	public static function build( $ctx ) {
		$sub      = isset( $ctx['sub'] ) ? $ctx['sub'] : array();
		$ans      = isset( $ctx['answers'] ) ? $ctx['answers'] : array();
		$risk     = isset( $ctx['risk_profile'] ) ? (string) $ctx['risk_profile'] : '';
		$capacity = isset( $ctx['capacity'] ) ? (float) $ctx['capacity'] : 0.0;
		$goals    = isset( $ctx['goals_count'] ) ? (int) $ctx['goals_count'] : 0;
		$cur      = isset( $ctx['currency'] ) ? $ctx['currency'] : 'KES';

		$sv = function ( $k ) use ( $sub ) {
			return ( isset( $sub[ $k ] ) && null !== $sub[ $k ] ) ? (float) $sub[ $k ] : null;
		};
		$text = function ( $k ) use ( $ans ) {
			return isset( $ans[ $k ] ) ? (string) $ans[ $k ]['text'] : '';
		};

		$items = array();

		$emerg = $sv( 'emergency' );
		if ( null === $emerg || $emerg < 60 ) {
			$items[] = array( 1, 'Build your emergency fund', 'Aim for 3-6 months of expenses in an easy-access account before locking money away.' );
		}
		$debt = $sv( 'debt' );
		if ( null !== $debt && $debt < 50 ) {
			$items[] = array( 1, 'Reduce expensive debt', 'Clearing high-interest debt is one of the best guaranteed returns you can get.' );
		}
		$ins = $sv( 'insurance' );
		if ( null === $ins || $ins < 50 ) {
			$items[] = array( 2, 'Protect your family', 'Health and life cover shield your savings from unexpected shocks.' );
		}
		if ( 0 === $goals ) {
			$items[] = array( 2, 'Set your first goal', 'Add a goal in the My Goals tab - even a small target gives your saving direction.' );
		}
		if ( $capacity > 0 ) {
			$prod    = self::products_for( $risk );
			$profile = $risk ? $risk : 'balanced';
			$items[] = array( 2, 'Put your capacity to work', 'You could invest about ' . $cur . ' ' . number_format( $capacity ) . ' a month. For your ' . $profile . ' profile, consider ' . $prod . '.' );
		}
		$div = $sv( 'diversification' );
		if ( null !== $div && $div < 60 ) {
			$items[] = array( 3, 'Diversify your investments', 'Spreading across SACCO, money market, bonds and property lowers your overall risk.' );
		}
		$ret      = $sv( 'retirement' );
		$has_plan = $text( 'has_retirement_plan' );
		if ( ( null !== $ret && $ret < 60 ) || 'no' === $has_plan ) {
			$items[] = array( 3, 'Plan for retirement', 'Start or grow a retirement pot - small, regular contributions compound powerfully over time.' );
		}
		if ( '' !== $text( 'preferred_sectors' ) ) {
			$items[] = array( 4, 'We will watch your sectors', 'You showed interest in specific sectors - we will flag matching AWIVEST opportunities to you.' );
		}

		if ( ! $items ) {
			$items[] = array( 4, 'You are in great shape', 'Keep your contributions steady and revisit your profile each year to stay on track.' );
		}

		usort(
			$items,
			function ( $a, $b ) {
				return $a[0] - $b[0];
			}
		);
		return array_slice( $items, 0, 6 );
	}

	/** Risk-appropriate, illustrative product ideas (never a recommendation to buy). */
	public static function products_for( $risk ) {
		switch ( $risk ) {
			case 'conservative':
				return 'money market funds and government bonds';
			case 'moderate':
				return 'a mix of money market funds, SACCO savings and unit trusts';
			case 'balanced':
				return 'balanced funds, SACCO and diversified unit trusts';
			case 'growth':
				return 'equities and property alongside some fixed income';
			case 'aggressive':
				return 'growth equities and property, keeping a small cash buffer';
			default:
				return 'a diversified mix suited to your goals';
		}
	}

	/** Render the recommendation list. */
	public static function render( $items ) {
		if ( ! $items ) {
			return;
		}
		echo '<div class="awivest-msi-recs"><h4>Your personalised recommendations</h4>';
		foreach ( $items as $it ) {
			echo '<div class="awivest-msi-rec"><strong>' . esc_html( $it[1] ) . '</strong><span>' . esc_html( $it[2] ) . '</span></div>';
		}
		echo '<p class="awivest-msi-savenote">General guidance based on your answers - not personal financial advice.</p>';
		echo '</div>';
	}
}
