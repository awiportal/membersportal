<?php
/**
 * MSI wizard - guided profile steps + Financial Wellness results (v2.11.1).
 *
 * Renders the profile steps defined in AWIVEST_MSI_Fields, one per screen, with
 * a progress bar and server-side Back / Next (works without JavaScript, which
 * suits low-bandwidth mobile use). Each step is saved as the member advances, so
 * "save & continue later" is automatic. On the final step the answers are scored
 * by AWIVEST_MSI_Scoring and the member sees their Financial Wellness Score.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_MSI_Wizard {

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

	/** Ordered field-step keys (steps in the registry that have fields). */
	public static function sequence() {
		return array_keys( AWIVEST_MSI_Fields::active_steps() );
	}

	private static function first_step() {
		$seq = self::sequence();
		return $seq ? $seq[0] : '';
	}

	private static function step_index( $step ) {
		$seq = self::sequence();
		$i   = array_search( $step, $seq, true );
		return false === $i ? 0 : (int) $i;
	}

	/* ------------------------------------------------------------------ */
	/* POST handling                                                       */
	/* ------------------------------------------------------------------ */

	public function handle_post() {
		$action = isset( $_POST['awivest_action'] ) ? sanitize_key( wp_unslash( $_POST['awivest_action'] ) ) : '';
		if ( 'msi_wizard' !== $action ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in.' );
		}
		$nonce = isset( $_POST['awivest_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['awivest_nonce'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, 'awivest_msi_wizard' ) ) {
			wp_die( 'Security check failed. Please go back and try again.' );
		}

		$msi  = AWIVEST_MSI::instance();
		$inv  = AWIVEST_DB::current_investor();
		$back = add_query_arg( 'view', 'msi', AWIVEST_Auth::instance()->portal_url() );

		if ( ! $inv || 'active' !== $inv->status ) {
			AWIVEST_Auth::instance()->flash( 'error', array( 'Your Financial Profile becomes available once your membership is approved.' ) );
			AWIVEST_Auth::go( AWIVEST_Auth::instance()->portal_url() );
			exit;
		}
		$assessment = $msi->open_assessment( $inv );
		if ( ! $assessment || ! $assessment->consent_given ) {
			AWIVEST_Auth::instance()->flash( 'error', array( 'Please start your Financial Profile and agree to the consent first.' ) );
			AWIVEST_Auth::go( $back );
			exit;
		}

		$dir  = isset( $_POST['dir'] ) ? sanitize_key( wp_unslash( $_POST['dir'] ) ) : 'next';
		$step = isset( $_POST['step'] ) ? sanitize_key( wp_unslash( $_POST['step'] ) ) : self::first_step();
		$seq  = self::sequence();
		if ( ! in_array( $step, $seq, true ) ) {
			$step = self::first_step();
		}

		// Save this step's answers (relax required-field checks when going back).
		$errors = $this->save_step( $assessment, $step, ( 'prev' !== $dir ) );
		if ( $errors && 'prev' !== $dir ) {
			AWIVEST_Auth::instance()->flash( 'error', $errors );
			AWIVEST_Auth::go( add_query_arg( 'step', $step, $back ) );
			exit;
		}

		$idx = self::step_index( $step );

		if ( 'prev' === $dir ) {
			$target = $seq[ max( 0, $idx - 1 ) ];
			$this->set_progress( $assessment, $target );
			AWIVEST_Auth::go( add_query_arg( 'step', $target, $back ) );
			exit;
		}

		if ( 'submit' === $dir || $idx >= ( count( $seq ) - 1 ) ) {
			$missing = $this->validate_all( $assessment );
			if ( $missing ) {
				AWIVEST_Auth::instance()->flash( 'error', $missing );
				AWIVEST_Auth::go( add_query_arg( 'step', $step, $back ) );
				exit;
			}
			AWIVEST_MSI_Scoring::compute( $assessment );
			global $wpdb;
			$now = current_time( 'mysql' );
			$wpdb->update(
				AWIVEST_MSI_Schema::assessments(),
				array( 'status' => 'submitted', 'progress_pct' => 100, 'current_step' => 'results', 'submitted_at' => $now, 'updated_at' => $now ),
				array( 'id' => $assessment->id )
			);
			AWIVEST_DB::log( $inv->investor_id, 'msi_submit', 'Member submitted Financial Profile; wellness score computed.' );
			AWIVEST_Auth::instance()->flash( 'success', array( 'Thank you - your Financial Profile is complete. Here is your Financial Wellness Score.' ) );
			AWIVEST_Auth::go( $back );
			exit;
		}

		$target = $seq[ min( count( $seq ) - 1, $idx + 1 ) ];
		$this->set_progress( $assessment, $target );
		AWIVEST_Auth::go( add_query_arg( 'step', $target, $back ) );
		exit;
	}

	/** Persist one step's answers. Returns array of error strings (empty if OK). */
	private function save_step( $assessment, $step, $strict ) {
		$fields = AWIVEST_MSI_Fields::fields_for_step( $step );
		$raw    = ( isset( $_POST['msi_field'] ) && is_array( $_POST['msi_field'] ) ) ? wp_unslash( $_POST['msi_field'] ) : array();
		$errors = array();

		foreach ( $fields as $key => $def ) {
			$val  = isset( $raw[ $key ] ) ? $raw[ $key ] : '';
			$type = isset( $def['type'] ) ? $def['type'] : 'text';
			$num  = null;
			$text = '';

			if ( 'number' === $type || 'money' === $type ) {
				$val = trim( (string) $val );
				if ( '' !== $val ) {
					if ( ! is_numeric( $val ) ) {
						$errors[] = $def['label'] . ': please enter a number.';
						continue;
					}
					$num = (float) $val;
					if ( isset( $def['min'] ) && $num < $def['min'] ) {
						$errors[] = $def['label'] . ': must be at least ' . $def['min'] . '.';
						continue;
					}
					if ( isset( $def['max'] ) && $num > $def['max'] ) {
						$errors[] = $def['label'] . ': must be at most ' . $def['max'] . '.';
						continue;
					}
					$text = (string) $num;
				}
			} elseif ( 'multiselect' === $type ) {
				$chosen = is_array( $val ) ? $val : array();
				$opts   = isset( $def['options'] ) ? $def['options'] : array();
				$valid  = array();
				foreach ( $chosen as $c ) {
					$c = sanitize_key( (string) $c );
					if ( isset( $opts[ $c ] ) && ! in_array( $c, $valid, true ) ) {
						$valid[] = $c;
					}
				}
				$text = implode( ',', $valid );
			} elseif ( 'select' === $type || 'radio' === $type ) {
				$val = sanitize_text_field( (string) $val );
				if ( '' !== $val && isset( $def['options'] ) && ! isset( $def['options'][ $val ] ) ) {
					$errors[] = $def['label'] . ': please choose a valid option.';
					continue;
				}
				$text = $val;
			} else {
				$text = sanitize_text_field( (string) $val );
			}

			if ( $strict && ! empty( $def['required'] ) && '' === trim( (string) $text ) ) {
				$errors[] = $def['label'] . ' is required.';
				continue;
			}

			$this->upsert_response( $assessment, $key, $text, $num );
		}
		return $errors;
	}

	private function upsert_response( $assessment, $key, $text, $num ) {
		global $wpdb;
		$table    = AWIVEST_MSI_Schema::responses();
		$existing = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} WHERE assessment_id = %d AND field_key = %s", $assessment->id, $key ) );
		$data     = array(
			'assessment_id' => (int) $assessment->id,
			'investor_id'   => $assessment->investor_id,
			'field_key'     => $key,
			'value_text'    => $text,
			'value_num'     => $num,
		);
		if ( $existing ) {
			$wpdb->update( $table, $data, array( 'id' => $existing ) );
		} else {
			$wpdb->insert( $table, $data );
		}
	}

	private function set_progress( $assessment, $step ) {
		global $wpdb;
		$seq = self::sequence();
		$idx = self::step_index( $step );
		$pct = count( $seq ) > 0 ? (int) round( ( $idx / count( $seq ) ) * 100 ) : 0;
		$wpdb->update(
			AWIVEST_MSI_Schema::assessments(),
			array( 'current_step' => $step, 'progress_pct' => $pct, 'updated_at' => current_time( 'mysql' ) ),
			array( 'id' => $assessment->id )
		);
	}

	/** Validate all required fields across steps; returns error strings. */
	private function validate_all( $assessment ) {
		$ans = array();
		foreach ( AWIVEST_MSI_Scoring::answers( $assessment->id ) as $k => $v ) {
			$ans[ $k ] = (string) $v['text'];
		}
		$errors = array();
		foreach ( AWIVEST_MSI_Fields::registry() as $key => $def ) {
			if ( ! empty( $def['required'] ) && ( ! isset( $ans[ $key ] ) || '' === trim( $ans[ $key ] ) ) ) {
				$errors[] = $def['label'] . ' is required (step: ' . $this->step_title( $def['step'] ) . ').';
			}
		}
		return $errors;
	}

	private function step_title( $step ) {
		$steps = AWIVEST_MSI_Fields::steps();
		return isset( $steps[ $step ]['title'] ) ? $steps[ $step ]['title'] : $step;
	}

	/* ------------------------------------------------------------------ */
	/* Rendering                                                           */
	/* ------------------------------------------------------------------ */

	private function values( $assessment_id ) {
		$out = array();
		foreach ( AWIVEST_MSI_Scoring::answers( $assessment_id ) as $k => $v ) {
			$out[ $k ] = (string) $v['text'];
		}
		return $out;
	}

	/** Render the wizard for the current step. */
	public function render( $inv, $assessment ) {
		$seq = self::sequence();
		if ( ! $seq ) {
			echo '<div class="awivest-card"><p>The questionnaire is being set up. Please check back shortly.</p></div>';
			return;
		}
		$step = isset( $_GET['step'] ) ? sanitize_key( wp_unslash( $_GET['step'] ) ) : ( $assessment->current_step ? $assessment->current_step : self::first_step() );
		if ( ! in_array( $step, $seq, true ) ) {
			$step = self::first_step();
		}
		$idx     = self::step_index( $step );
		$total   = count( $seq );
		$meta    = AWIVEST_MSI_Fields::steps();
		$title   = isset( $meta[ $step ]['title'] ) ? $meta[ $step ]['title'] : $step;
		$intro   = isset( $meta[ $step ]['intro'] ) ? $meta[ $step ]['intro'] : '';
		$fields  = AWIVEST_MSI_Fields::fields_for_step( $step );
		$values  = $this->values( $assessment->id );
		$pct     = (int) round( ( $idx / $total ) * 100 );
		$is_last = ( $idx >= ( $total - 1 ) );

		echo '<div class="awivest-card awivest-msi-wizard">';
		echo '<div class="awivest-msi-stephead"><span>Step ' . (int) ( $idx + 1 ) . ' of ' . (int) $total . '</span><span>' . esc_html( $title ) . '</span></div>';
		echo '<div class="awivest-msi-progress"><span style="width:' . esc_attr( max( 6, $pct ) ) . '%"></span></div>';
		if ( $intro ) {
			echo '<p class="awivest-hint">' . esc_html( $intro ) . '</p>';
		}

		echo '<form method="post" class="awivest-form awivest-msi-form">';
		wp_nonce_field( 'awivest_msi_wizard', 'awivest_nonce' );
		echo '<input type="hidden" name="awivest_action" value="msi_wizard">';
		echo '<input type="hidden" name="step" value="' . esc_attr( $step ) . '">';
		foreach ( $fields as $key => $def ) {
			$this->render_field( $key, $def, isset( $values[ $key ] ) ? $values[ $key ] : '' );
		}
		echo '<div class="awivest-msi-navbtns">';
		if ( $idx > 0 ) {
			echo '<button type="submit" name="dir" value="prev" class="awivest-btn awivest-btn-outline">Back</button>';
		}
		if ( $is_last ) {
			echo '<button type="submit" name="dir" value="submit" class="awivest-btn">See my results</button>';
		} else {
			echo '<button type="submit" name="dir" value="next" class="awivest-btn">Save &amp; continue</button>';
		}
		echo '</div>';
		echo '<p class="awivest-msi-savenote">Your answers save as you go - you can leave and continue any time.</p>';
		echo '</form>';
		echo '</div>';
	}

	private function render_field( $key, $def, $value ) {
		$type   = isset( $def['type'] ) ? $def['type'] : 'text';
		$label  = isset( $def['label'] ) ? $def['label'] : $key;
		$prompt = isset( $def['prompt'] ) ? $def['prompt'] : $label;
		$req    = ! empty( $def['required'] ) ? ' <span class="awivest-req">*</span>' : '';
		$unit   = isset( $def['unit'] ) ? $def['unit'] : '';
		$name   = 'msi_field[' . $key . ']';

		echo '<div class="awivest-msi-field">';
		echo '<label class="awivest-msi-q">' . esc_html( $prompt ) . wp_kses_post( $req ) . '</label>';

		if ( 'select' === $type ) {
			echo '<select name="' . esc_attr( $name ) . '">';
			echo '<option value="">Please choose...</option>';
			foreach ( (array) $def['options'] as $ov => $ol ) {
				echo '<option value="' . esc_attr( $ov ) . '"' . selected( $value, $ov, false ) . '>' . esc_html( $ol ) . '</option>';
			}
			echo '</select>';
		} elseif ( 'radio' === $type ) {
			echo '<div class="awivest-msi-radios">';
			foreach ( (array) $def['options'] as $ov => $ol ) {
				echo '<label class="awivest-inline"><input type="radio" name="' . esc_attr( $name ) . '" value="' . esc_attr( $ov ) . '"' . checked( $value, $ov, false ) . '> ' . esc_html( $ol ) . '</label>';
			}
			echo '</div>';
		} elseif ( 'number' === $type || 'money' === $type ) {
			$min    = isset( $def['min'] ) ? ' min="' . esc_attr( $def['min'] ) . '"' : '';
			$max    = isset( $def['max'] ) ? ' max="' . esc_attr( $def['max'] ) . '"' : '';
			$step   = ( 'money' === $type ) ? '1' : 'any';
			echo '<div class="awivest-msi-inputwrap">';
			if ( 'money' === $type && $unit ) {
				echo '<span class="awivest-msi-unit">' . esc_html( $unit ) . '</span>';
			}
			echo '<input type="number" step="' . esc_attr( $step ) . '"' . $min . $max . ' name="' . esc_attr( $name ) . '" value="' . esc_attr( $value ) . '">';
			if ( 'number' === $type && $unit ) {
				echo '<span class="awivest-msi-unit-suffix">' . esc_html( $unit ) . '</span>';
			}
			echo '</div>';
		} elseif ( 'multiselect' === $type ) {
			$chosen = array_filter( array_map( 'trim', explode( ',', (string) $value ) ) );
			echo '<div class="awivest-msi-checks">';
			foreach ( (array) $def['options'] as $ov => $ol ) {
				echo '<label class="awivest-inline"><input type="checkbox" name="' . esc_attr( $name ) . '[]" value="' . esc_attr( $ov ) . '"' . checked( in_array( $ov, $chosen, true ), true, false ) . '> ' . esc_html( $ol ) . '</label>';
			}
			echo '</div>';
		} else {
			echo '<input type="text" name="' . esc_attr( $name ) . '" value="' . esc_attr( $value ) . '">';
		}
		echo '</div>';
	}

	/** Render the Financial Wellness results after submission. */
	public function render_results( $inv, $assessment ) {
		$res        = AWIVEST_MSI_Scoring::compute( $assessment ); // idempotent refresh
		$total      = (int) $res['total'];
		$band       = $res['band'];
		$sub        = $res['subscores'];
		$labels     = AWIVEST_MSI_Scoring::subscore_labels();
		$a          = AWIVEST_MSI::assumptions();
		$cur        = $a['currency'];
		$band_class = strtolower( str_replace( ' ', '-', $band ) );

		echo '<div class="awivest-card awivest-msi-results">';
		echo '<h2>Your Financial Wellness Score</h2>';
		echo '<div class="awivest-msi-gauge awivest-band-' . esc_attr( $band_class ) . '">';
		echo '<div class="awivest-msi-gauge-num">' . (int) $total . '<small>/100</small></div>';
		echo '<div class="awivest-msi-gauge-band">' . esc_html( $band ) . '</div>';
		echo '</div>';

		echo '<div class="awivest-msi-subs">';
		foreach ( $labels as $k => $lab ) {
			$v  = isset( $sub[ $k ] ) ? $sub[ $k ] : null;
			$na = ( null === $v );
			echo '<div class="awivest-msi-sub">';
			echo '<div class="awivest-msi-sub-top"><span>' . esc_html( $lab ) . '</span><span>' . ( $na ? 'Not yet' : (int) round( $v ) ) . '</span></div>';
			echo '<div class="awivest-msi-bar' . ( $na ? ' awivest-msi-bar-na' : '' ) . '"><span style="width:' . esc_attr( $na ? 0 : (int) round( $v ) ) . '%"></span></div>';
			echo '</div>';
		}
		echo '</div>';

		echo '<div class="awivest-msi-grid2">';
		echo '<div class="awivest-stat"><span>Estimated net worth</span><strong>' . esc_html( $cur . ' ' . number_format( (float) $res['net_worth'] ) ) . '</strong></div>';
		echo '<div class="awivest-stat"><span>Monthly amount you could invest</span><strong>' . esc_html( $cur . ' ' . number_format( (float) $res['capacity'] ) ) . '</strong></div>';
		echo '</div>';

		$risk = isset( $res['risk_profile'] ) ? $res['risk_profile'] : '';
		if ( $risk ) {
			$rlabels = array(
				'conservative' => 'Conservative',
				'moderate'     => 'Moderate',
				'balanced'     => 'Balanced',
				'growth'       => 'Growth',
				'aggressive'   => 'Aggressive',
			);
			$rdesc = array(
				'conservative' => 'You prefer safety and steady, lower returns.',
				'moderate'     => 'You accept small ups and downs for modestly higher returns.',
				'balanced'     => 'You are comfortable with a mix of growth and stability.',
				'growth'       => 'You are willing to ride bigger swings for higher long-term growth.',
				'aggressive'   => 'You are comfortable with high volatility in pursuit of maximum growth.',
			);
			$rlabel = isset( $rlabels[ $risk ] ) ? $rlabels[ $risk ] : ucfirst( $risk );
			$rret   = AWIVEST_MSI_Calculators::expected_return( $risk );
			$rret_s = rtrim( rtrim( number_format( (float) $rret, 1 ), '0' ), '.' );
			echo '<div class="awivest-msi-risk">';
			echo '<h4>Your investor risk profile</h4>';
			echo '<p><span class="awivest-badge">' . esc_html( $rlabel ) . '</span> ' . esc_html( isset( $rdesc[ $risk ] ) ? $rdesc[ $risk ] : '' ) . '</p>';
			echo '<p class="awivest-msi-savenote">We use about ' . esc_html( $rret_s ) . '% as your illustrative planning return - you will see it pre-filled in your goals and calculators. Illustrative only, never guaranteed.</p>';
			echo '</div>';

			$ans_hope = AWIVEST_MSI_Scoring::answers( $assessment->id );
			$hope     = ( isset( $ans_hope['expected_return_hope'] ) && null !== $ans_hope['expected_return_hope']['num'] && '' !== (string) $ans_hope['expected_return_hope']['num'] ) ? (float) $ans_hope['expected_return_hope']['num'] : null;
			if ( null !== $hope ) {
				$aggr = (float) $a['return_aggressive'];
				$ref  = (float) $rret;
				$hope_s = rtrim( rtrim( number_format( $hope, 1 ), '0' ), '.' );
				if ( $hope > $aggr ) {
					$note = 'You hope for about ' . $hope_s . '% a year. That is higher than our most ambitious planning assumption (' . rtrim( rtrim( number_format( $aggr, 1 ), '0' ), '.' ) . '%). Higher returns usually come with higher risk, so plan with a margin of safety.';
				} elseif ( $hope <= $ref + 2 ) {
					$note = 'You hope for about ' . $hope_s . '% a year, which sits comfortably within your ' . strtolower( $rlabel ) . ' profile.';
				} else {
					$note = 'You hope for about ' . $hope_s . '% a year - a little above your ' . strtolower( $rlabel ) . ' profile. Reaching it may mean taking a bit more risk than your answers suggest you prefer.';
				}
				echo '<div class="awivest-notice">' . esc_html( $note ) . '</div>';
			}
		}

		$mcis = isset( $res['mcis'] ) ? $res['mcis'] : null;
		if ( $mcis ) {
			$active_key = isset( $mcis['mcis_tier_key'] ) ? $mcis['mcis_tier_key'] : '';
			echo '<div class="awivest-msi-mcis">';
			echo '<h4>Your commitment level</h4>';
			echo '<p><span class="awivest-badge">' . esc_html( $mcis['mcis_tier'] ) . '</span> ' . (int) $mcis['mcis_score'] . '/100</p>';
			echo '<div class="awivest-msi-ladder">';
			foreach ( AWIVEST_MSI_MCIS::tiers() as $t ) {
				$on = ( $t['key'] === $active_key ) ? ' is-on' : '';
				echo '<span class="awivest-msi-rung' . esc_attr( $on ) . '">' . esc_html( $t['label'] ) . '</span>';
			}
			echo '</div>';
			echo '<p class="awivest-msi-savenote">' . esc_html( AWIVEST_MSI_MCIS::tier_desc_for( $active_key ) ) . '</p>';
			echo '<p>Your segments: <span class="awivest-badge">' . esc_html( $mcis['segment_primary'] ) . '</span> <span class="awivest-badge">' . esc_html( $mcis['segment_secondary'] ) . '</span></p>';
			echo '</div>';
		}

		$recs = AWIVEST_MSI_Recommendations::build(
			array(
				'sub'          => $sub,
				'answers'      => AWIVEST_MSI_Scoring::answers( $assessment->id ),
				'risk_profile' => $risk,
				'capacity'     => (float) $res['capacity'],
				'goals_count'  => $mcis ? (int) $mcis['goals_count'] : 0,
				'currency'     => $cur,
			)
		);
		AWIVEST_MSI_Recommendations::render( $recs );

		$pending = array();
		foreach ( array( 'diversification', 'retirement', 'insurance' ) as $pk ) {
			if ( ! isset( $sub[ $pk ] ) || null === $sub[ $pk ] ) {
				$pending[] = $pk;
			}
		}
		if ( $pending ) {
			echo '<p class="awivest-hint">Complete the ' . esc_html( implode( ', ', $pending ) ) . ' questions (under Your Family, Preferences and Retirement) to unlock more of your score - reopen and update any time.</p>';
		}

		echo '<form method="post" class="awivest-form" style="margin-top:10px">';
		wp_nonce_field( 'awivest_msi_reopen', 'awivest_nonce' );
		echo '<input type="hidden" name="awivest_action" value="msi_reopen">';
		echo '<button type="submit" class="awivest-btn awivest-btn-outline">Review or update my answers</button>';
		echo '</form>';
		echo '</div>';
	}

	private function quick_wins( $sub ) {
		$tips = array();
		if ( isset( $sub['emergency'] ) && null !== $sub['emergency'] && $sub['emergency'] < 60 ) {
			$tips[] = 'Build your emergency fund towards 6 months of expenses.';
		}
		if ( isset( $sub['savings'] ) && null !== $sub['savings'] && $sub['savings'] < 60 ) {
			$tips[] = 'Aim to save or invest at least 20% of your monthly income.';
		}
		if ( isset( $sub['debt'] ) && null !== $sub['debt'] && $sub['debt'] < 60 ) {
			$tips[] = 'Reduce high-interest debt to strengthen your financial base.';
		}
		if ( isset( $sub['investment'] ) && null !== $sub['investment'] && $sub['investment'] < 60 ) {
			$tips[] = 'Consider moving idle savings into suitable investments to grow your wealth.';
		}
		if ( isset( $sub['diversification'] ) && null !== $sub['diversification'] && $sub['diversification'] < 60 ) {
			$tips[] = 'Spread your money across more than one type of investment to reduce risk.';
		}
		if ( isset( $sub['retirement'] ) && null !== $sub['retirement'] && $sub['retirement'] < 60 ) {
			$tips[] = 'Start or grow a dedicated retirement plan - even a small monthly amount compounds over time.';
		}
		if ( isset( $sub['insurance'] ) && null !== $sub['insurance'] && $sub['insurance'] < 60 ) {
			$tips[] = 'Consider health and life cover to protect your family and your savings.';
		}
		if ( ! $tips ) {
			$tips[] = 'You are on a strong footing - keep it up and revisit your profile each year.';
		}
		return $tips;
	}
}
