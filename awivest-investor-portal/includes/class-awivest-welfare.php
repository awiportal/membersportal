<?php
/**
 * Welfare module.
 *
 * A self-contained welfare scheme on top of the investor portal:
 *   - Enrollment form (one record per member, admin-approved)
 *   - Claim form (many per member, each with its own review/payment lifecycle)
 *   - Exit form (member requests to leave; admin processes)
 *   - Welfare statement (live summary + admin-published statement documents)
 *
 * Statuses:
 *   record.status : not_enrolled (no row) / pending / enrolled / rejected / exit_requested / exited
 *   claim.status  : pending / approved / rejected / paid
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_Welfare {

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

	public static function claim_types() {
		return array( 'Bereavement', 'Medical', 'Education', 'Disability', 'Other' );
	}

	private function get_record( $investor_id ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::welfare() . ' WHERE investor_id = %s', $investor_id ) );
	}

	private function badge( $status ) {
		$map = array(
			'enrolled'       => 'approved',
			'approved'       => 'approved',
			'paid'           => 'approved',
			'exited'         => 'deactivated',
			'exit_requested' => 'pending',
			'pending'        => 'pending',
			'not_enrolled'   => 'not_submitted',
			'rejected'       => 'rejected',
		);
		$cls = isset( $map[ $status ] ) ? $map[ $status ] : 'pending';
		return '<span class="awivest-badge ' . esc_attr( $cls ) . '">' . esc_html( ucwords( str_replace( '_', ' ', $status ) ) ) . '</span>';
	}

	/* ---------------- Front-end handlers ---------------- */

	public function handle() {
		if ( empty( $_POST['awivest_action'] ) ) {
			return;
		}
		$action = sanitize_key( wp_unslash( $_POST['awivest_action'] ) );
		if ( ! in_array( $action, array( 'welfare_enroll', 'welfare_claim', 'welfare_exit' ), true ) ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			wp_die( 'Please log in.' );
		}
		if ( ! isset( $_POST['awivest_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['awivest_nonce'] ) ), 'awivest_welfare' ) ) {
			wp_die( 'Security check failed.' );
		}
		$investor = AWIVEST_DB::current_investor();
		if ( ! $investor ) {
			wp_die( 'Investor profile not found.' );
		}

		if ( 'welfare_enroll' === $action ) {
			$this->enroll( $investor );
		} elseif ( 'welfare_claim' === $action ) {
			$this->claim( $investor );
		} else {
			$this->exit_request( $investor );
		}
	}

	private function redirect( $type, $messages ) {
		AWIVEST_Auth::instance()->flash( $type, (array) $messages );
		wp_safe_redirect( add_query_arg( 'view', 'welfare', AWIVEST_Auth::instance()->portal_url() ) );
		exit;
	}

	private function post( $key ) {
		return isset( $_POST[ $key ] ) ? wp_unslash( $_POST[ $key ] ) : '';
	}

	private function enroll( $investor ) {
		global $wpdb;
		$existing = $this->get_record( $investor->investor_id );
		if ( $existing && in_array( $existing->status, array( 'pending', 'enrolled', 'exit_requested' ), true ) ) {
			$this->redirect( 'error', 'You already have an active or pending welfare membership.' );
		}

		$next_of_kin = sanitize_text_field( $this->post( 'next_of_kin' ) );
		$errors      = array();
		if ( strlen( $next_of_kin ) < 2 ) {
			$errors[] = 'Next of kin is required.';
		}
		if ( empty( $_POST['declaration'] ) ) {
			$errors[] = 'You must accept the declaration to enroll.';
		}
		if ( $errors ) {
			$this->redirect( 'error', $errors );
		}

		$data = array(
			'status'               => 'pending',
			'next_of_kin'          => $next_of_kin,
			'next_of_kin_phone'    => sanitize_text_field( $this->post( 'next_of_kin_phone' ) ),
			'dependants'           => sanitize_textarea_field( $this->post( 'dependants' ) ),
			'monthly_contribution' => floatval( $this->post( 'monthly_contribution' ) ),
			'admin_comment'        => '',
			'updated_at'           => current_time( 'mysql' ),
		);

		if ( $existing ) {
			$wpdb->update( AWIVEST_DB::welfare(), $data, array( 'id' => $existing->id ) );
		} else {
			$data['investor_id'] = $investor->investor_id;
			$data['created_at']  = current_time( 'mysql' );
			$wpdb->insert( AWIVEST_DB::welfare(), $data );
		}

		AWIVEST_DB::log( $investor->investor_id, 'welfare_enroll', '' );
		AWIVEST_Notifications::send( AWIVEST_Notifications::admin_email(), 'Welfare enrollment', array( 'Investor ' . esc_html( $investor->investor_id ) . ' submitted a welfare enrollment for approval.' ) );
		$this->redirect( 'success', 'Your welfare enrollment has been submitted for approval.' );
	}

	private function claim( $investor ) {
		$record = $this->get_record( $investor->investor_id );
		if ( ! $record || 'enrolled' !== $record->status ) {
			$this->redirect( 'error', 'You must be an enrolled welfare member to file a claim.' );
		}

		$type = sanitize_text_field( $this->post( 'claim_type' ) );
		if ( ! in_array( $type, self::claim_types(), true ) ) {
			$type = 'Other';
		}
		$amount      = floatval( $this->post( 'amount' ) );
		$description = sanitize_textarea_field( $this->post( 'description' ) );

		$file_path = '';
		if ( ! empty( $_FILES['claim_file']['name'] ) ) {
			$stored = AWIVEST_KYC::instance()->store_file( $_FILES['claim_file'] );
			if ( is_wp_error( $stored ) ) {
				$this->redirect( 'error', $stored->get_error_message() );
			}
			$file_path = $stored['relative'];
		}

		global $wpdb;
		$wpdb->insert(
			AWIVEST_DB::welfare_claims(),
			array(
				'investor_id' => $investor->investor_id,
				'claim_type'  => $type,
				'amount'      => $amount,
				'description' => $description,
				'file_path'   => $file_path,
				'status'      => 'pending',
				'created_at'  => current_time( 'mysql' ),
			)
		);

		AWIVEST_DB::log( $investor->investor_id, 'welfare_claim', $type );
		AWIVEST_Notifications::send( AWIVEST_Notifications::admin_email(), 'Welfare claim filed', array( 'Investor ' . esc_html( $investor->investor_id ) . ' filed a ' . esc_html( $type ) . ' welfare claim for KES ' . esc_html( number_format( $amount, 2 ) ) . '.' ) );
		$this->redirect( 'success', 'Your welfare claim has been submitted and is pending review.' );
	}

	private function exit_request( $investor ) {
		global $wpdb;
		$record = $this->get_record( $investor->investor_id );
		if ( ! $record || 'enrolled' !== $record->status ) {
			$this->redirect( 'error', 'Only enrolled members can request an exit.' );
		}
		if ( empty( $_POST['declaration'] ) ) {
			$this->redirect( 'error', 'You must accept the exit declaration.' );
		}
		$reason = sanitize_textarea_field( $this->post( 'exit_reason' ) );
		$wpdb->update(
			AWIVEST_DB::welfare(),
			array( 'status' => 'exit_requested', 'exit_reason' => $reason, 'updated_at' => current_time( 'mysql' ) ),
			array( 'id' => $record->id )
		);
		AWIVEST_DB::log( $investor->investor_id, 'welfare_exit_request', '' );
		AWIVEST_Notifications::send( AWIVEST_Notifications::admin_email(), 'Welfare exit request', array( 'Investor ' . esc_html( $investor->investor_id ) . ' requested to exit the welfare scheme.' ) );
		$this->redirect( 'success', 'Your exit request has been submitted for processing.' );
	}

	/* ---------------- Front-end view ---------------- */

	public function render_view() {
		$investor = AWIVEST_DB::current_investor();
		if ( ! $investor ) {
			return;
		}
		$record = $this->get_record( $investor->investor_id );
		$status = $record ? $record->status : 'not_enrolled';

		echo '<div class="awivest-card"><h2>Welfare Scheme</h2>';
		echo '<div class="awivest-grid">';
		echo '<div class="awivest-stat"><span>Membership</span>' . $this->badge( $status ) . '</div>';
		if ( $record && $record->enrolled_at ) {
			echo '<div class="awivest-stat"><span>Enrolled</span><strong>' . esc_html( mysql2date( 'M j, Y', $record->enrolled_at ) ) . '</strong></div>';
		}
		if ( $record ) {
			echo '<div class="awivest-stat"><span>Monthly Contribution</span><strong>KES ' . esc_html( number_format( (float) $record->monthly_contribution, 2 ) ) . '</strong></div>';
		}
		echo '</div>';
		if ( $record && $record->admin_comment ) {
			echo '<p class="awivest-hint">Note from administrator: ' . esc_html( $record->admin_comment ) . '</p>';
		}
		echo '</div>';

		if ( in_array( $status, array( 'not_enrolled', 'rejected' ), true ) ) {
			$this->render_enroll_form();
			return;
		}

		$this->render_statement( $investor );

		if ( 'enrolled' === $status ) {
			$this->render_claim_form();
		}
		$this->render_claims_table( $investor );

		if ( 'enrolled' === $status ) {
			$this->render_exit_form();
		} elseif ( 'exit_requested' === $status ) {
			echo '<div class="awivest-card"><p>Your exit request is being processed by the administrator.</p></div>';
		}
	}

	private function render_enroll_form() {
		?>
		<div class="awivest-card">
			<h2>Welfare Enrollment</h2>
			<form method="post" class="awivest-form">
				<?php wp_nonce_field( 'awivest_welfare', 'awivest_nonce' ); ?>
				<input type="hidden" name="awivest_action" value="welfare_enroll">
				<label>Next of Kin (full name)<input type="text" name="next_of_kin" required></label>
				<label>Next of Kin Phone<input type="tel" name="next_of_kin_phone"></label>
				<label>Dependants (name and relationship, one per line)<textarea name="dependants" rows="3"></textarea></label>
				<label>Proposed Monthly Contribution (KES)<input type="number" step="0.01" min="0" name="monthly_contribution" value="0"></label>
				<label class="awivest-inline"><input type="checkbox" name="declaration" value="1" required> I declare the information above is accurate and agree to the welfare scheme rules.</label>
				<button class="awivest-btn" type="submit">Submit Enrollment</button>
			</form>
		</div>
		<?php
	}

	private function render_statement( $investor ) {
		global $wpdb;
		$filed = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . AWIVEST_DB::welfare_claims() . ' WHERE investor_id = %s', $investor->investor_id ) );
		$paid  = (float) $wpdb->get_var( $wpdb->prepare( 'SELECT COALESCE(SUM(amount),0) FROM ' . AWIVEST_DB::welfare_claims() . " WHERE investor_id = %s AND status = 'paid'", $investor->investor_id ) );

		echo '<div class="awivest-card"><h2>Welfare Statement</h2>';
		echo '<div class="awivest-grid">';
		echo '<div class="awivest-stat"><span>Claims Filed</span><strong>' . esc_html( $filed ) . '</strong></div>';
		echo '<div class="awivest-stat"><span>Claims Paid (KES)</span><strong>' . esc_html( number_format( $paid, 2 ) ) . '</strong></div>';
		echo '</div>';

		$docs = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::documents() . " WHERE (visibility = 'all' OR investor_id = %s) AND document_type = 'welfare_statement' ORDER BY created_at DESC", $investor->investor_id ) );
		if ( $docs ) {
			echo '<table class="awivest-table"><thead><tr><th>Statement</th><th>Date</th><th></th></tr></thead><tbody>';
			foreach ( $docs as $d ) {
				echo '<tr><td>' . esc_html( $d->title ) . '</td><td>' . esc_html( mysql2date( 'M j, Y', $d->created_at ) ) . '</td><td><a class="awivest-btn small" href="' . esc_url( AWIVEST_Documents::download_url( 'document', $d->id ) ) . '">Download</a></td></tr>';
			}
			echo '</tbody></table>';
		} else {
			echo '<p class="awivest-hint">No statement documents published yet.</p>';
		}
		echo '</div>';
	}

	private function render_claim_form() {
		?>
		<div class="awivest-card">
			<h2>File a Welfare Claim</h2>
			<form method="post" enctype="multipart/form-data" class="awivest-form">
				<?php wp_nonce_field( 'awivest_welfare', 'awivest_nonce' ); ?>
				<input type="hidden" name="awivest_action" value="welfare_claim">
				<label>Claim Type
					<select name="claim_type" required>
						<?php foreach ( self::claim_types() as $t ) { echo '<option value="' . esc_attr( $t ) . '">' . esc_html( $t ) . '</option>'; } ?>
					</select>
				</label>
				<label>Amount Requested (KES)<input type="number" step="0.01" min="0" name="amount" required></label>
				<label>Description / Circumstances<textarea name="description" rows="3"></textarea></label>
				<label>Supporting Document (optional)<input type="file" name="claim_file" accept=".pdf,.jpg,.jpeg,.png,.docx"></label>
				<button class="awivest-btn" type="submit">Submit Claim</button>
			</form>
		</div>
		<?php
	}

	private function render_claims_table( $investor ) {
		global $wpdb;
		$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::welfare_claims() . ' WHERE investor_id = %s ORDER BY created_at DESC', $investor->investor_id ) );
		echo '<div class="awivest-card"><h2>My Claims</h2>';
		echo '<table class="awivest-table"><thead><tr><th>Type</th><th>Amount (KES)</th><th>Status</th><th>Comment</th><th>Date</th><th></th></tr></thead><tbody>';
		if ( $rows ) {
			foreach ( $rows as $r ) {
				$file = $r->file_path ? '<a class="awivest-btn small" href="' . esc_url( AWIVEST_Documents::download_url( 'welfare_claim', $r->id ) ) . '">View</a>' : '';
				echo '<tr><td>' . esc_html( $r->claim_type ) . '</td><td>' . esc_html( number_format( (float) $r->amount, 2 ) ) . '</td><td>' . $this->badge( $r->status ) . '</td><td>' . esc_html( $r->admin_comment ) . '</td><td>' . esc_html( mysql2date( 'M j, Y', $r->created_at ) ) . '</td><td>' . $file . '</td></tr>';
			}
		} else {
			echo '<tr><td colspan="6">No claims filed yet.</td></tr>';
		}
		echo '</tbody></table></div>';
	}

	private function render_exit_form() {
		?>
		<div class="awivest-card">
			<h2>Request to Exit Welfare Scheme</h2>
			<form method="post" class="awivest-form">
				<?php wp_nonce_field( 'awivest_welfare', 'awivest_nonce' ); ?>
				<input type="hidden" name="awivest_action" value="welfare_exit">
				<label>Reason for Exit<textarea name="exit_reason" rows="3"></textarea></label>
				<label class="awivest-inline"><input type="checkbox" name="declaration" value="1" required> I confirm I wish to exit the welfare scheme and understand any applicable rules.</label>
				<button class="awivest-btn" type="submit">Submit Exit Request</button>
			</form>
		</div>
		<?php
	}

	/* ---------------- Admin ---------------- */

	public function admin_menu() {
		add_submenu_page( 'awivest', 'Welfare', 'Welfare', 'manage_options', 'awivest-welfare', array( $this, 'admin_page' ) );
	}

	public function admin_handle() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$action = isset( $_POST['awivest_admin_action'] ) ? sanitize_key( $_POST['awivest_admin_action'] ) : '';

		if ( 'welfare_review_enrollment' === $action ) {
			check_admin_referer( 'awivest_welfare_admin' );
			global $wpdb;
			$id       = isset( $_POST['record_id'] ) ? absint( $_POST['record_id'] ) : 0;
			$decision = isset( $_POST['decision'] ) ? sanitize_key( $_POST['decision'] ) : '';
			$comment  = sanitize_text_field( $this->post( 'comment' ) );
			$row      = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::welfare() . ' WHERE id = %d', $id ) );
			if ( $row ) {
				if ( 'approve' === $decision ) {
					$wpdb->update( AWIVEST_DB::welfare(), array( 'status' => 'enrolled', 'enrolled_at' => current_time( 'mysql' ), 'admin_comment' => $comment, 'reviewed_by' => get_current_user_id(), 'reviewed_at' => current_time( 'mysql' ), 'updated_at' => current_time( 'mysql' ) ), array( 'id' => $id ) );
				} else {
					$wpdb->update( AWIVEST_DB::welfare(), array( 'status' => 'rejected', 'admin_comment' => $comment, 'reviewed_by' => get_current_user_id(), 'reviewed_at' => current_time( 'mysql' ), 'updated_at' => current_time( 'mysql' ) ), array( 'id' => $id ) );
				}
				$this->notify_member( $row->investor_id, 'Welfare enrollment ' . ( 'approve' === $decision ? 'approved' : 'rejected' ), array( 'Your welfare enrollment has been ' . ( 'approve' === $decision ? 'approved. Welcome to the scheme.' : 'rejected.' ), $comment ? 'Note: ' . esc_html( $comment ) : '' ) );
				AWIVEST_DB::log( $row->investor_id, 'welfare_enroll_review', $decision );
			}
			$this->redirect_admin();
		}

		if ( 'welfare_review_claim' === $action ) {
			check_admin_referer( 'awivest_welfare_admin' );
			global $wpdb;
			$id       = isset( $_POST['claim_id'] ) ? absint( $_POST['claim_id'] ) : 0;
			$decision = isset( $_POST['decision'] ) ? sanitize_key( $_POST['decision'] ) : '';
			$comment  = sanitize_text_field( $this->post( 'comment' ) );
			$map      = array( 'approve' => 'approved', 'reject' => 'rejected', 'paid' => 'paid' );
			$status   = isset( $map[ $decision ] ) ? $map[ $decision ] : 'pending';
			$row      = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::welfare_claims() . ' WHERE id = %d', $id ) );
			if ( $row ) {
				$wpdb->update( AWIVEST_DB::welfare_claims(), array( 'status' => $status, 'admin_comment' => $comment, 'reviewed_by' => get_current_user_id(), 'reviewed_at' => current_time( 'mysql' ) ), array( 'id' => $id ) );
				$this->notify_member( $row->investor_id, 'Welfare claim ' . $status, array( 'Your ' . esc_html( $row->claim_type ) . ' claim has been ' . esc_html( $status ) . '.', $comment ? 'Note: ' . esc_html( $comment ) : '' ) );
				AWIVEST_DB::log( $row->investor_id, 'welfare_claim_review', $status );
			}
			$this->redirect_admin();
		}

		if ( 'welfare_review_exit' === $action ) {
			check_admin_referer( 'awivest_welfare_admin' );
			global $wpdb;
			$id  = isset( $_POST['record_id'] ) ? absint( $_POST['record_id'] ) : 0;
			$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . AWIVEST_DB::welfare() . ' WHERE id = %d', $id ) );
			if ( $row ) {
				$wpdb->update( AWIVEST_DB::welfare(), array( 'status' => 'exited', 'exit_at' => current_time( 'mysql' ), 'updated_at' => current_time( 'mysql' ) ), array( 'id' => $id ) );
				$this->notify_member( $row->investor_id, 'Welfare exit processed', array( 'Your exit from the welfare scheme has been processed.' ) );
				AWIVEST_DB::log( $row->investor_id, 'welfare_exit_review', 'exited' );
			}
			$this->redirect_admin();
		}
	}

	private function notify_member( $investor_id, $subject, $lines ) {
		$inv = AWIVEST_DB::get_investor_by_investor_id( $investor_id );
		if ( ! $inv ) {
			return;
		}
		$user = get_user_by( 'id', $inv->wp_user_id );
		if ( $user ) {
			AWIVEST_Notifications::send( $user->user_email, $subject, $lines );
		}
	}

	private function redirect_admin() {
		wp_safe_redirect( add_query_arg( array( 'page' => 'awivest-welfare', 'updated' => 1 ), admin_url( 'admin.php' ) ) );
		exit;
	}

	public function admin_page() {
		global $wpdb;
		$records = $wpdb->get_results( 'SELECT * FROM ' . AWIVEST_DB::welfare() . " ORDER BY FIELD(status,'pending','exit_requested','enrolled','exited','rejected'), updated_at DESC" );
		$claims  = $wpdb->get_results( 'SELECT * FROM ' . AWIVEST_DB::welfare_claims() . " ORDER BY FIELD(status,'pending','approved','paid','rejected'), created_at DESC" );

		echo '<div class="wrap"><h1>Welfare Scheme</h1>';

		echo '<h2>Enrollments &amp; Exits</h2>';
		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><th>Investor</th><th>Next of Kin</th><th>Monthly (KES)</th><th>Status</th><th>Action</th></tr></thead><tbody>';
		if ( $records ) {
			foreach ( $records as $r ) {
				echo '<tr><td>' . esc_html( $r->investor_id ) . '</td><td>' . esc_html( $r->next_of_kin ) . '</td><td>' . esc_html( number_format( (float) $r->monthly_contribution, 2 ) ) . '</td><td>' . esc_html( $r->status ) . '</td><td>';
				if ( 'pending' === $r->status ) {
					echo '<form method="post" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
					wp_nonce_field( 'awivest_welfare_admin' );
					echo '<input type="hidden" name="awivest_admin_action" value="welfare_review_enrollment"><input type="hidden" name="record_id" value="' . (int) $r->id . '">';
					echo '<input type="text" name="comment" placeholder="Comment">';
					echo '<button class="button button-primary" name="decision" value="approve">Approve</button>';
					echo '<button class="button" name="decision" value="reject">Reject</button>';
					echo '</form>';
				} elseif ( 'exit_requested' === $r->status ) {
					echo '<form method="post">';
					wp_nonce_field( 'awivest_welfare_admin' );
					echo '<input type="hidden" name="awivest_admin_action" value="welfare_review_exit"><input type="hidden" name="record_id" value="' . (int) $r->id . '">';
					echo '<button class="button button-primary">Process Exit</button>';
					echo '</form>';
				} else {
					echo '&mdash;';
				}
				echo '</td></tr>';
			}
		} else {
			echo '<tr><td colspan="5">No welfare members yet.</td></tr>';
		}
		echo '</tbody></table>';

		echo '<h2>Claims</h2>';
		echo '<table class="wp-list-table widefat fixed striped"><thead><tr><th>Investor</th><th>Type</th><th>Amount (KES)</th><th>File</th><th>Status</th><th>Review</th></tr></thead><tbody>';
		if ( $claims ) {
			foreach ( $claims as $c ) {
				$file = $c->file_path ? '<a href="' . esc_url( AWIVEST_Documents::download_url( 'welfare_claim', $c->id ) ) . '">View</a>' : '&mdash;';
				echo '<tr><td>' . esc_html( $c->investor_id ) . '</td><td>' . esc_html( $c->claim_type ) . '</td><td>' . esc_html( number_format( (float) $c->amount, 2 ) ) . '</td><td>' . $file . '</td><td>' . esc_html( $c->status ) . '</td><td>';
				echo '<form method="post" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
				wp_nonce_field( 'awivest_welfare_admin' );
				echo '<input type="hidden" name="awivest_admin_action" value="welfare_review_claim"><input type="hidden" name="claim_id" value="' . (int) $c->id . '">';
				echo '<input type="text" name="comment" placeholder="Comment" value="' . esc_attr( $c->admin_comment ) . '">';
				echo '<button class="button button-primary" name="decision" value="approve">Approve</button>';
				echo '<button class="button" name="decision" value="paid">Mark Paid</button>';
				echo '<button class="button" name="decision" value="reject">Reject</button>';
				echo '</form></td></tr>';
			}
		} else {
			echo '<tr><td colspan="6">No claims filed yet.</td></tr>';
		}
		echo '</tbody></table>';
		echo '<p class="description">Publish a member welfare statement from AWIVEST &rarr; Documents using document type <code>welfare_statement</code>.</p>';
		echo '</div>';
	}
}
