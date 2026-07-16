<?php
/**
 * MSI question registry - the single source of truth for the Member Success
 * Index. The wizard UI, validation, scoring, CSV export and admin dashboard are
 * all generated from this registry, so each question is defined exactly once.
 *
 *   steps()    - ordered wizard steps (key, title, conversational intro, icon).
 *   registry() - field definitions keyed by field_key. Each field declares:
 *                step, label, prompt, type, options, unit, required, min, max,
 *                scores_into (which score it feeds, if any) and csv_col.
 *
 * Foundation (v2.11.0) ships the step list plus the Member Profile fields
 * (Section 3 of the blueprint). Later increments extend this array with habits,
 * goals, risk, preferences, expectations, engagement and MCIS fields.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AWIVEST_MSI_Fields {

	/** Ordered wizard steps. Keys are stable identifiers stored on the assessment. */
	public static function steps() {
		return array(
			'welcome'     => array( 'title' => 'Welcome', 'intro' => 'A few minutes now helps us match you to the right opportunities and track your progress over time.', 'icon' => 'star' ),
			'about'       => array( 'title' => 'About You', 'intro' => 'Let us start with a little about you.', 'icon' => 'user' ),
			'family'      => array( 'title' => 'Your Family', 'intro' => 'Who depends on you shapes your plan.', 'icon' => 'users' ),
			'income'      => array( 'title' => 'Your Income', 'intro' => 'What comes in each month.', 'icon' => 'wallet' ),
			'investments' => array( 'title' => 'Current Investments', 'intro' => 'What you have built so far - there are no wrong answers.', 'icon' => 'chart' ),
			'habits'      => array( 'title' => 'Financial Habits', 'intro' => 'How you like to save and spend.', 'icon' => 'refresh' ),
			'goals'       => array( 'title' => 'Your Goals', 'intro' => 'What you are working towards.', 'icon' => 'target' ),
			'dreams'      => array( 'title' => 'Dream Lifestyle', 'intro' => 'Picture the life you want.', 'icon' => 'sun' ),
			'risk'        => array( 'title' => 'Risk Appetite', 'intro' => 'How you feel about ups and downs.', 'icon' => 'shield' ),
			'preferences' => array( 'title' => 'Investment Preferences', 'intro' => 'The kinds of investments that interest you.', 'icon' => 'list' ),
			'horizon'     => array( 'title' => 'Time Horizon', 'intro' => 'How long you plan to invest.', 'icon' => 'clock' ),
			'retirement'  => array( 'title' => 'Retirement', 'intro' => 'Planning for later life.', 'icon' => 'home' ),
			'legacy'      => array( 'title' => 'Legacy', 'intro' => 'The mark you want to leave.', 'icon' => 'gift' ),
			'results'     => array( 'title' => 'Your Results', 'intro' => 'Your Financial Wellness Score and highlights.', 'icon' => 'gauge' ),
			'action'      => array( 'title' => 'Your Action Plan', 'intro' => 'Simple next steps tailored to you.', 'icon' => 'check' ),
			'done'        => array( 'title' => 'Done', 'intro' => 'Thank you - your profile is complete.', 'icon' => 'flag' ),
		);
	}

	/**
	 * Field definitions. Foundation ships Member Profile fields; the array grows
	 * in later increments. Net worth is calculated (assets - liabilities), not
	 * captured, so it is not a field here.
	 */
	public static function registry() {
		return array(

			/* ---- About You ---- */
			'age' => array(
				'step' => 'about', 'label' => 'Age', 'prompt' => 'How old are you?',
				'type' => 'number', 'unit' => 'years', 'required' => true, 'min' => 18, 'max' => 100,
				'scores_into' => 'retirement', 'csv_col' => 'age',
			),
			'occupation' => array(
				'step' => 'about', 'label' => 'Occupation', 'prompt' => 'What do you do?',
				'type' => 'text', 'required' => false, 'csv_col' => 'occupation',
			),
			'employment_status' => array(
				'step' => 'about', 'label' => 'Employment status', 'prompt' => 'Which best describes your work?',
				'type' => 'select', 'required' => true, 'scores_into' => 'income_stability',
				'options' => array(
					'permanent' => 'Employed (permanent)',
					'contract'  => 'Employed (contract)',
					'self'      => 'Self-employed / business',
					'gig'       => 'Casual / gig work',
					'student'   => 'Student',
					'retired'   => 'Retired',
					'between'   => 'Between jobs',
				),
				'csv_col' => 'employment_status',
			),
			'business_owner' => array(
				'step' => 'about', 'label' => 'Business owner', 'prompt' => 'Do you own a business?',
				'type' => 'radio', 'required' => false,
				'options' => array( 'yes' => 'Yes', 'no' => 'No' ),
				'csv_col' => 'business_owner',
			),
			'industry' => array(
				'step' => 'about', 'label' => 'Industry', 'prompt' => 'Which industry do you work in?',
				'type' => 'text', 'required' => false, 'csv_col' => 'industry',
			),
			'location' => array(
				'step' => 'about', 'label' => 'Location', 'prompt' => 'Which town or county are you in?',
				'type' => 'text', 'required' => false, 'csv_col' => 'location',
			),
			'education' => array(
				'step' => 'about', 'label' => 'Education', 'prompt' => 'Your highest level of education?',
				'type' => 'select', 'required' => false,
				'options' => array(
					'primary'   => 'Primary',
					'secondary' => 'Secondary',
					'college'   => 'College / Diploma',
					'undergrad' => 'Undergraduate degree',
					'postgrad'  => 'Postgraduate degree',
					'other'     => 'Other',
				),
				'csv_col' => 'education',
			),

			/* ---- Your Family ---- */
			'marital_status' => array(
				'step' => 'family', 'label' => 'Marital status', 'prompt' => 'What is your marital status?',
				'type' => 'select', 'required' => false,
				'options' => array(
					'single'   => 'Single',
					'married'  => 'Married',
					'divorced' => 'Divorced',
					'widowed'  => 'Widowed',
					'other'    => 'Prefer not to say',
				),
				'csv_col' => 'marital_status',
			),
			'dependants' => array(
				'step' => 'family', 'label' => 'Dependants', 'prompt' => 'How many people depend on you financially?',
				'type' => 'number', 'required' => false, 'min' => 0, 'max' => 30, 'csv_col' => 'dependants',
			),
			'children' => array(
				'step' => 'family', 'label' => 'Children', 'prompt' => 'How many children do you have?',
				'type' => 'number', 'required' => false, 'min' => 0, 'max' => 30, 'csv_col' => 'children',
			),

			/* ---- Your Income ---- */
			'monthly_income_range' => array(
				'step' => 'income', 'label' => 'Monthly income', 'prompt' => 'Roughly, what is your monthly income?',
				'type' => 'select', 'required' => true,
				'options' => array(
					'u25k'     => 'Under KES 25,000',
					'25-50k'   => 'KES 25,000 - 50,000',
					'50-100k'  => 'KES 50,000 - 100,000',
					'100-250k' => 'KES 100,000 - 250,000',
					'250-500k' => 'KES 250,000 - 500,000',
					'o500k'    => 'Over KES 500,000',
				),
				'csv_col' => 'monthly_income_range',
			),
			'monthly_expenses' => array(
				'step' => 'income', 'label' => 'Monthly expenses', 'prompt' => 'About how much do you spend each month?',
				'type' => 'money', 'unit' => 'KES', 'required' => false, 'min' => 0,
				'scores_into' => 'emergency', 'csv_col' => 'monthly_expenses',
			),
			'income_stability' => array(
				'step' => 'income', 'label' => 'Income stability', 'prompt' => 'How steady is your income?',
				'type' => 'radio', 'required' => false, 'scores_into' => 'income_stability',
				'options' => array(
					'very'      => 'Very steady',
					'mostly'    => 'Mostly steady',
					'irregular' => 'Irregular',
				),
				'csv_col' => 'income_stability',
			),

			/* ---- Current Investments ---- */
			'monthly_savings' => array(
				'step' => 'investments', 'label' => 'Monthly savings', 'prompt' => 'How much do you save or invest each month?',
				'type' => 'money', 'unit' => 'KES', 'required' => false, 'min' => 0,
				'scores_into' => 'savings', 'csv_col' => 'monthly_savings',
			),
			'emergency_fund' => array(
				'step' => 'investments', 'label' => 'Emergency fund', 'prompt' => 'How much do you have set aside for emergencies?',
				'type' => 'money', 'unit' => 'KES', 'required' => false, 'min' => 0,
				'scores_into' => 'emergency', 'csv_col' => 'emergency_fund',
			),
			'current_savings' => array(
				'step' => 'investments', 'label' => 'Current savings', 'prompt' => 'Total savings you hold today (bank, SACCO, cash).',
				'type' => 'money', 'unit' => 'KES', 'required' => false, 'min' => 0, 'csv_col' => 'current_savings',
			),
			'current_investments' => array(
				'step' => 'investments', 'label' => 'Current investments', 'prompt' => 'Total value of your investments today.',
				'type' => 'money', 'unit' => 'KES', 'required' => false, 'min' => 0,
				'scores_into' => 'investment', 'csv_col' => 'current_investments',
			),
			'assets' => array(
				'step' => 'investments', 'label' => 'Assets', 'prompt' => 'Estimated value of everything you own (property, vehicles, business).',
				'type' => 'money', 'unit' => 'KES', 'required' => false, 'min' => 0, 'csv_col' => 'assets',
			),
			'liabilities' => array(
				'step' => 'investments', 'label' => 'Liabilities', 'prompt' => 'Total of what you owe (loans, debts).',
				'type' => 'money', 'unit' => 'KES', 'required' => false, 'min' => 0,
				'scores_into' => 'debt', 'csv_col' => 'liabilities',
			),

			/* ---- Protection (shown on Your Family) ---- */
			'insurance_types' => array(
				'step' => 'family', 'label' => 'Insurance cover', 'prompt' => 'Which types of insurance do you currently have? (choose any)',
				'type' => 'multiselect', 'required' => false, 'scores_into' => 'insurance',
				'options' => array(
					'health'     => 'Health / medical',
					'life'       => 'Life',
					'education'  => 'Education policy',
					'disability' => 'Disability / income protection',
					'property'   => 'Property / asset',
					'none'       => 'None yet',
				),
				'csv_col' => 'insurance_types',
			),

			/* ---- Risk Appetite ---- */
			'risk_reaction' => array(
				'step' => 'risk', 'label' => 'Reaction to a drop', 'prompt' => 'If your investments fell 20% in a year, what would you most likely do?',
				'type' => 'radio', 'required' => false, 'scores_into' => 'risk',
				'options' => array(
					'sell_all'  => 'Sell everything to avoid more loss',
					'sell_some' => 'Sell some to be safe',
					'hold'      => 'Do nothing and wait for recovery',
					'buy_more'  => 'Invest more while prices are low',
				),
				'csv_col' => 'risk_reaction',
			),
			'risk_pref' => array(
				'step' => 'risk', 'label' => 'Ideal investment', 'prompt' => 'Which investment appeals to you most?',
				'type' => 'radio', 'required' => false, 'scores_into' => 'risk',
				'options' => array(
					'safe'   => 'Safe, with low but steady returns',
					'steady' => 'Balanced, with moderate returns',
					'higher' => 'Higher returns, with some ups and downs',
					'max'    => 'Maximum growth - big swings are fine',
				),
				'csv_col' => 'risk_pref',
			),
			'risk_experience' => array(
				'step' => 'risk', 'label' => 'Experience', 'prompt' => 'How experienced are you with investing?',
				'type' => 'radio', 'required' => false, 'scores_into' => 'risk',
				'options' => array(
					'none'        => 'New to it',
					'some'        => 'A little',
					'experienced' => 'Fairly experienced',
					'expert'      => 'Very experienced',
				),
				'csv_col' => 'risk_experience',
			),
			'risk_capacity' => array(
				'step' => 'risk', 'label' => 'Capacity for loss', 'prompt' => 'If an investment lost value, how much would it affect your day-to-day life?',
				'type' => 'radio', 'required' => false, 'scores_into' => 'risk',
				'options' => array(
					'severe'      => 'Severely',
					'significant' => 'Significantly',
					'manageable'  => 'Manageable',
					'minimal'     => 'Very little',
				),
				'csv_col' => 'risk_capacity',
			),

			/* ---- Investment Preferences ---- */
			'preferred_sectors' => array(
				'step' => 'preferences', 'label' => 'Preferred sectors', 'prompt' => 'Which sectors interest you most? (choose any)',
				'type' => 'multiselect', 'required' => false,
				'options' => array(
					'agriculture'   => 'Agriculture / agribusiness',
					'property'      => 'Real estate / property',
					'technology'    => 'Technology',
					'financial'     => 'Financial services',
					'manufacturing' => 'Manufacturing',
					'retail'        => 'Retail / trade',
					'energy'        => 'Energy',
					'health'        => 'Health',
					'education'     => 'Education',
					'tourism'       => 'Tourism / hospitality',
				),
				'csv_col' => 'preferred_sectors',
			),
			'investment_types' => array(
				'step' => 'preferences', 'label' => 'Investments held', 'prompt' => 'Which of these do you currently invest in? (choose any)',
				'type' => 'multiselect', 'required' => false, 'scores_into' => 'diversification',
				'options' => array(
					'sacco'    => 'SACCO',
					'mmf'      => 'Money market fund',
					'shares'   => 'Shares / stocks',
					'bonds'    => 'Bonds / T-bills',
					'property' => 'Property / land',
					'business' => 'Business',
					'unit'     => 'Unit trust',
					'pension'  => 'Pension / insurance',
					'crypto'   => 'Crypto',
					'other'    => 'Other',
				),
				'csv_col' => 'investment_types',
			),
			'esg_preference' => array(
				'step' => 'preferences', 'label' => 'Ethical preference', 'prompt' => 'Do you prefer ethical or socially responsible investments?',
				'type' => 'radio', 'required' => false,
				'options' => array(
					'yes' => 'Yes, important to me',
					'no'  => 'Not a priority',
					'na'  => 'No preference',
				),
				'csv_col' => 'esg_preference',
			),
			'liquidity_preference' => array(
				'step' => 'preferences', 'label' => 'Access to money', 'prompt' => 'How easily do you want to be able to access your invested money?',
				'type' => 'radio', 'required' => false,
				'options' => array(
					'easy'   => 'Any time',
					'medium' => 'Within a year',
					'locked' => 'Happy to lock it away for years',
				),
				'csv_col' => 'liquidity_preference',
			),

			/* ---- Time Horizon & Expectations ---- */
			'investment_horizon' => array(
				'step' => 'horizon', 'label' => 'Time horizon', 'prompt' => 'How long do you plan to keep your money invested?',
				'type' => 'select', 'required' => false,
				'options' => array(
					'u1'   => 'Less than 1 year',
					'1-3'  => '1 - 3 years',
					'3-5'  => '3 - 5 years',
					'5-10' => '5 - 10 years',
					'o10'  => 'More than 10 years',
				),
				'csv_col' => 'investment_horizon',
			),
			'expected_return_hope' => array(
				'step' => 'horizon', 'label' => 'Return hoped for', 'prompt' => 'What annual return do you hope to earn? (optional)',
				'type' => 'number', 'unit' => '%', 'required' => false, 'min' => 0, 'max' => 100,
				'csv_col' => 'expected_return_hope',
			),

			/* ---- Retirement ---- */
			'has_retirement_plan' => array(
				'step' => 'retirement', 'label' => 'Retirement plan', 'prompt' => 'Do you have a retirement plan or pension (NSSF, employer, or private)?',
				'type' => 'radio', 'required' => false, 'scores_into' => 'retirement',
				'options' => array(
					'yes'      => 'Yes',
					'no'       => 'No',
					'not_sure' => 'Not sure',
				),
				'csv_col' => 'has_retirement_plan',
			),
			'retirement_savings' => array(
				'step' => 'retirement', 'label' => 'Retirement savings', 'prompt' => 'How much have you set aside specifically for retirement?',
				'type' => 'money', 'unit' => 'KES', 'required' => false, 'min' => 0,
				'scores_into' => 'retirement', 'csv_col' => 'retirement_savings',
			),
			'retirement_age_target' => array(
				'step' => 'retirement', 'label' => 'Target retirement age', 'prompt' => 'At what age would you like to retire?',
				'type' => 'number', 'unit' => 'years', 'required' => false, 'min' => 40, 'max' => 90,
				'csv_col' => 'retirement_age_target',
			),
		);
	}

	/** All field definitions for a given step key. */
	public static function fields_for_step( $step ) {
		$out = array();
		foreach ( self::registry() as $key => $def ) {
			if ( isset( $def['step'] ) && $def['step'] === $step ) {
				$out[ $key ] = $def;
			}
		}
		return $out;
	}

	/** A single field definition (or null). */
	public static function get( $key ) {
		$reg = self::registry();
		return isset( $reg[ $key ] ) ? $reg[ $key ] : null;
	}

	/** Steps that currently have at least one field defined (drives the live wizard). */
	public static function active_steps() {
		$out = array();
		foreach ( self::steps() as $key => $meta ) {
			if ( self::fields_for_step( $key ) ) {
				$out[ $key ] = $meta;
			}
		}
		return $out;
	}
}
