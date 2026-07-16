<?php
/**
 * Member Success Index (MSI) - module bootstrap and member-facing controller.
 *
 * v2.11.0 (Foundation) provides:
 *  - the module singleton + hooks;
 *  - AWI-approved planning assumptions (KES; admin-editable);
 *  - a daily cron scaffold for the annual-review scheduler (wired in a later
 *    increment);
 *  - the member consent / privacy intro screen;
 *  - the dashboard "Complete your Financial Profile" entry point;
 *  - assessment (snapshot) creation and consent capture.
 *
 * The guided questionnaire, scoring, goals, calculators, segmentation, MCIS and
 * admin analytics are layered on in subsequent v2.11.x increments; they all read
 * the registry in AWIVEST_MSI_Fields and the tables in AWIVEST_MSI_Schema.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_MSI {

	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'handle_post' ) );
		add_action( 'awivest_msi_daily', array( $this, 'cron_daily' ) );
		if ( ! wp_next_scheduled( 'awivest_msi_daily' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'awivest_msi_daily' );
		}
	}

	/**
	 * AWI-approved planning assumptions (illustrative only, never guaranteed).
	 * Admin-editable via the awivest_msi_assumptions option; a settings screen is
	 * added in a later increment.
	 */
	public static function assumptions() {
		$defaults = array(
			'currency'            => 'KES',
			'inflation'           => 6.0,
			'return_conservative' => 8.0,
			'return_moderate'     => 10.0,
			'return_balanced'     => 12.0,
			'return_growth'       => 15.0,
			'return_aggressive'   => 18.0,
			'review_months'       => 12,
		);
		$saved = get_option( 'awivest_msi_assumptions', array() );
		if ( ! is_array( $saved ) ) {
			$saved = array();
		}
		return array_merge( $defaults, $saved );
	}

	/**
	 * Whether the guided questionnaire is open to members yet. Foundation keeps
	 * this false (consent capture only); later increments flip it via the filter.
	 */
	public static function questionnaire_ready() {
		return (bool) apply_filters( 'awivest_msi_questionnaire_ready', false );
	}

	/** Cycle label for a new assessment, e.g. the current year. */
	public static function current_cycle_label() {
		return gmdate( 'Y' );
	}

	/** The member's most recent risk profile tier (from scores), or 'balanced'. */
	public static function member_risk_profile( $inv ) {
		if ( ! $inv ) {
			return 'balanced';
		}
		global $wpdb;
		$tier = $wpdb->get_var(
			$wpdb->prepare(
				'SELECT s.risk_profile FROM ' . AWIVEST_MSI_Schema::scores() . ' s INNER JOIN ' . AWIVEST_MSI_Schema::assessments() . " a ON a.id = s.assessment_id WHERE s.investor_id = %s AND s.risk_profile <> '' ORDER BY a.id DESC LIMIT 1",
				$inv->investor_id
			)
		);
		return $tier ? $tier : 'balanced';
	}

	/** The member's illustrative planning return (%) derived from their risk profile. */
	public static function member_return( $inv ) {
		return AWIVEST_MSI_Calculators::expected_return( self::member_risk_profile( $inv ) );
	}

	/** The member's most recent assessment row (any status), or null. */
	public function latest_assessment( $inv ) {
		if ( ! $inv ) {
			return null;
		}
		global $wpdb;
		return $wpdb->get_row(
			$wpdb->prepare(
				'SELECT * FROM ' . AWIVEST_MSI_Schema::assessments() . ' WHERE investor_id = %s ORDER BY id DESC LIMIT 1',
				$inv->investor_id
			)
		);
	}

	/** The member's current open (draft) assessment, or null. */
	public function open_assessment( $inv ) {
		if ( ! $inv ) {
			return null;
		}
		global $wpdb;
		return $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM " . AWIVEST_MSI_Schema::assessments() . " WHERE investor_id = %s AND status = 'draft' ORDER BY id DESC LIMIT 1",
				$inv->investor_id
			)
		);
	}

	/** Create a fresh draft assessment for a member and return its row. */
	public function create_assessment( $inv ) {
		global $wpdb;
		$now = current_time( 'mysql' );
		$wpdb->insert(
			AWIVEST_MSI_Schema::assessments(),
			array(
				'investor_id'  => $inv->investor_id,
				'wp_user_id'   => (int) $inv->wp_user_id,
				'cycle_label'  => self::current_cycle_label(),
				'status'       => 'draft',
				'progress_pct' => 0,
				'started_at'   => $now,
				'created_at'   => $now,
				'updated_at'   => $now,
			)
		);
		return $wpdb->insert_id ? $this->latest_assessment( $inv ) : null;
	}

	/** Daily cron: run annual-review reminders (and let others hook the tick). */
	public function cron_daily() {
		do_action( 'awivest_msi_cron_tick' );
		$this->run_annual_reviews();
	}

	/**
	 * Annual-review reminders. Nudges members whose latest submitted profile is
	 * due for its yearly refresh. Idempotent and batch-limited so it is safe to
	 * run daily on shared hosting: a member is reminded at most once per review
	 * period, and starting a fresh cycle resets the clock automatically.
	 */
	public function run_annual_reviews( $limit = 25 ) {
		global $wpdb;
		$a      = self::assumptions();
		$months = isset( $a['review_months'] ) ? (int) $a['review_months'] : 12;
		if ( $months < 1 ) {
			$months = 12;
		}
		$table  = AWIVEST_MSI_Schema::assessments();
		$cutoff = gmdate( 'Y-m-d H:i:s', strtotime( '-' . $months . ' months', current_time( 'timestamp' ) ) );

		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT a.* FROM {$table} a
				 WHERE a.status = 'submitted'
				   AND a.submitted_at IS NOT NULL
				   AND a.submitted_at <= %s
				   AND ( a.review_notified_at IS NULL OR a.review_notified_at <= %s )
				   AND a.id = ( SELECT MAX(b.id) FROM {$table} b WHERE b.investor_id = a.investor_id )
				 ORDER BY a.submitted_at ASC
				 LIMIT %d",
				$cutoff,
				$cutoff,
				(int) $limit
			)
		);
		if ( ! $rows ) {
			return 0;
		}

		$portal = AWIVEST_Auth::instance()->portal_url();
		$url    = add_query_arg( 'view', 'msi', $portal );
		$sent   = 0;
		foreach ( $rows as $r ) {
			$user  = $r->wp_user_id ? get_userdata( (int) $r->wp_user_id ) : null;
			$email = ( $user && is_email( $user->user_email ) ) ? $user->user_email : '';
			if ( $email ) {
				AWIVEST_Notifications::send(
					$email,
					'Time for your annual Financial Profile review',
					array(
						'It has been about a year since you completed your AWIVEST Financial Profile.',
						'Take a few minutes to refresh it so your Financial Wellness Score, goals and recommendations stay up to date: ' . esc_url_raw( $url ),
						'You can update as little or as much as you like - your previous answers are already saved.',
					)
				);
			}
			$wpdb->update( $table, array( 'review_notified_at' => current_time( 'mysql' ) ), array( 'id' => (int) $r->id ) );
			AWIVEST_DB::log( $r->investor_id, 'msi_review_due', 'Annual Financial Profile review reminder sent.' );
			$sent++;
		}
		return $sent;
	}

	/* --------------------------------------------------------------------- */
	/* Member POST handling                                                  */
	/* --------------------------------------------------------------------- */

	public function handle_post() {
		$action = isset( $_POST['awivest_action'] ) ? sanitize_key( wp_unslash( $_POST['awivest_action'] ) ) : '';
		if ( 'msi_reopen' === $action ) {
			$this->handle_reopen();
			return;
		}
		if ( 'msi_consent' !== $action ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in.' );
		}
		$nonce = isset( $_POST['awivest_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['awivest_nonce'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, 'awivest_msi_consent' ) ) {
			wp_die( 'Security check failed. Please go back and try again.' );
		}
		$inv  = AWIVEST_DB::current_investor();
		$back = add_query_arg( 'view', 'msi', AWIVEST_Auth::instance()->portal_url() );

		if ( ! $inv || 'active' !== $inv->status ) {
			AWIVEST_Auth::instance()->flash( 'error', array( 'Your Financial Profile becomes available once your membership is approved.' ) );
			AWIVEST_Auth::go( AWIVEST_Auth::instance()->portal_url() );
			exit;
		}
		if ( empty( $_POST['msi_consent'] ) ) {
			AWIVEST_Auth::instance()->flash( 'error', array( 'Please tick the consent box to begin your Financial Profile.' ) );
			AWIVEST_Auth::go( $back );
			exit;
		}

		$assessment = $this->open_assessment( $inv );
		if ( ! $assessment ) {
			$assessment = $this->create_assessment( $inv );
		}
		if ( $assessment ) {
			global $wpdb;
			$now = current_time( 'mysql' );
			$wpdb->update(
				AWIVEST_MSI_Schema::assessments(),
				array( 'consent_given' => 1, 'consent_at' => $now, 'updated_at' => $now ),
				array( 'id' => $assessment->id )
			);
			AWIVEST_DB::log( $inv->investor_id, 'msi_consent', 'Member consented to the Financial Profile (MSI).' );
		}
		AWIVEST_Auth::instance()->flash( 'success', array( 'Thank you. Your consent is recorded and your Financial Profile has been started.' ) );
		AWIVEST_Auth::go( $back );
		exit;
	}

	/** Reopen the latest assessment for review/updates (sets it back to draft). */
	private function handle_reopen() {
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in.' );
		}
		$nonce = isset( $_POST['awivest_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['awivest_nonce'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, 'awivest_msi_reopen' ) ) {
			wp_die( 'Security check failed. Please go back and try again.' );
		}
		$inv  = AWIVEST_DB::current_investor();
		$back = add_query_arg( 'view', 'msi', AWIVEST_Auth::instance()->portal_url() );
		if ( $inv && 'active' === $inv->status ) {
			$assessment = $this->latest_assessment( $inv );
			if ( $assessment ) {
				global $wpdb;
				$wpdb->update(
					AWIVEST_MSI_Schema::assessments(),
					array( 'status' => 'draft', 'current_step' => '', 'updated_at' => current_time( 'mysql' ) ),
					array( 'id' => $assessment->id )
				);
			}
		}
		AWIVEST_Auth::go( $back );
		exit;
	}

	/* --------------------------------------------------------------------- */
	/* Rendering                                                             */
	/* --------------------------------------------------------------------- */

	/** Sub-navigation tabs inside the Financial Profile page (Profile | Goals). */
	private function render_subnav( $active ) {
		$base        = AWIVEST_Auth::instance()->portal_url();
		$profile_url = add_query_arg( array( 'view' => 'msi' ), $base );
		$goals_url   = add_query_arg( array( 'view' => 'msi', 'sub' => 'goals' ), $base );
		echo '<div class="awivest-msi-subnav">';
		echo '<a href="' . esc_url( $profile_url ) . '" class="' . ( 'goals' === $active ? '' : 'is-active' ) . '">My Profile</a>';
		echo '<a href="' . esc_url( $goals_url ) . '" class="' . ( 'goals' === $active ? 'is-active' : '' ) . '">My Goals</a>';
		echo '</div>';
	}

	/** Dashboard call-to-action card shown to active members. */
	public function render_dashboard_card( $inv ) {
		if ( ! $inv || 'active' !== $inv->status ) {
			return;
		}
		$assessment = $this->latest_assessment( $inv );
		$url        = add_query_arg( 'view', 'msi', AWIVEST_Auth::instance()->portal_url() );
		$progress   = $assessment ? (int) $assessment->progress_pct : 0;
		$started    = $assessment && 'draft' === $assessment->status && $assessment->consent_given;
		$done       = $assessment && 'submitted' === $assessment->status;

		echo '<div class="awivest-card awivest-msi-cta">';
		echo '<h3>Your Financial Profile</h3>';
		if ( $done ) {
			echo '<p>Thank you - your Financial Profile is complete. You can review or update it at any time.</p>';
			echo '<p><a class="awivest-btn awivest-btn-outline" href="' . esc_url( $url ) . '">View my profile</a></p>';
		} elseif ( $started ) {
			echo '<p>You have started your Financial Profile. Pick up where you left off - it takes about 15 minutes and you can save and continue any time.</p>';
			echo '<div class="awivest-msi-progress"><span style="width:' . esc_attr( max( 5, $progress ) ) . '%"></span></div>';
			echo '<p><a class="awivest-btn" href="' . esc_url( $url ) . '">Continue my profile</a></p>';
		} else {
			echo '<p>Help us understand your goals so we can match you to the right opportunities. It takes about 15 minutes, it is private, and you can save and continue any time.</p>';
			echo '<p><a class="awivest-btn" href="' . esc_url( $url ) . '">Complete your Financial Profile</a></p>';
		}
		echo '</div>';

		AWIVEST_MSI_Goals::instance()->render_dashboard_tracker( $inv );
	}

	/** The MSI intro / consent / privacy screen (the view=msi page). */
	public function render_view( $inv ) {
		if ( ! $inv || 'active' !== $inv->status ) {
			echo '<div class="awivest-card"><h2>Financial Profile</h2><p>Your Financial Profile becomes available once your membership is approved.</p></div>';
			return;
		}
		$assessment = $this->latest_assessment( $inv );
		$consented  = $assessment && $assessment->consent_given;
		$a          = self::assumptions();

		if ( $consented ) {
			$sub = isset( $_GET['sub'] ) ? sanitize_key( wp_unslash( $_GET['sub'] ) ) : 'profile';
			$this->render_subnav( $sub );
			if ( 'goals' === $sub ) {
				AWIVEST_MSI_Goals::instance()->render_manager( $inv );
			} elseif ( 'submitted' === $assessment->status ) {
				AWIVEST_MSI_Wizard::instance()->render_results( $inv, $assessment );
			} else {
				AWIVEST_MSI_Wizard::instance()->render( $inv, $assessment );
			}
			return;
		}

		echo '<div class="awivest-card awivest-msi-intro">';
		echo '<h2>Your Financial Profile</h2>';
		echo '<p class="awivest-hint">A quick, friendly check-in that becomes your personal Financial Health Check with AWIVEST. We refresh it once a year so you can see your progress over time.</p>';
		echo '<div class="awivest-msi-badges"><span>About 15 minutes</span><span>Private &amp; secure</span><span>Save &amp; continue any time</span></div>';

		echo '<div class="awivest-msi-cols">';
		echo '<div><h4>Why complete it</h4><ul>';
		echo '<li>Discover and plan your financial goals.</li>';
		echo '<li>Get a Financial Wellness Score and simple next steps.</li>';
		echo '<li>Be matched to opportunities, training and events that fit you.</li>';
		echo '</ul></div>';
		echo '<div><h4>How AWIVEST uses it</h4><ul>';
		echo '<li>To understand members and improve services.</li>';
		echo '<li>To design investment products that fit real needs.</li>';
		echo '<li>Only aggregated, de-identified insights are used for planning.</li>';
		echo '</ul></div>';
		echo '</div>';

		echo '<div class="awivest-msi-privacy"><h4>Your data &amp; privacy</h4>';
		echo '<p>Your answers are stored securely and are visible only to you and authorised AWIVEST staff. We follow the Kenya Data Protection Act (2019): you can view, correct, download or delete your information, and withdraw marketing consent at any time without affecting your membership. You may skip any question you prefer not to answer.</p>';
		echo '</div>';
		echo '</div>';

		echo '<div class="awivest-card">';
		echo '<h3>Ready to begin?</h3>';
		echo '<form method="post" id="awivest-msi-consent-form" class="awivest-form">';
		wp_nonce_field( 'awivest_msi_consent', 'awivest_nonce' );
		echo '<input type="hidden" name="awivest_action" value="msi_consent">';
		echo '<label class="awivest-inline awivest-consent-line"><input type="checkbox" id="awivest-msi-consent" class="awivest-consent-check" name="msi_consent" value="1"> I agree to AWIVEST collecting and using the information in my Financial Profile as described above.</label>';
		echo '<button type="submit" id="awivest-msi-consent-btn" class="awivest-btn">Start my Financial Profile</button>';
		echo '</form>';
		echo '</div>';
	}
}
