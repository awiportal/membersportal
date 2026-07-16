// web/lib/msi.ts
// MSI = Member financial-wellness Index.
// Pure scoring logic with NO server- or client-only imports, so it can be
// imported from both server actions and client components.

export type Experience = 'none' | 'some' | 'experienced';
export type RiskAppetite = 'low' | 'medium' | 'high';
export type Horizon = 'short' | 'medium' | 'long';
export type RiskProfile = 'conservative' | 'moderate' | 'balanced' | 'growth' | 'aggressive';

export type MsiAnswers = {
  monthly_income: number;
  monthly_invest: number;
  emergency_months: number;
  current_savings: number;
  total_debt: number;
  monthly_debt: number;
  dependents: number;
  experience: Experience;
  risk_appetite: RiskAppetite;
  horizon: Horizon;
};

export type SubScores = { savings: number; emergency: number; debt: number; investing: number };

export type MsiResult = {
  wellness_score: number;
  wellness_band: string;
  sub_scores: SubScores;
  risk_profile: RiskProfile;
  planning_return: number;
  recommendations: string[];
};

export const EMPTY_ANSWERS: MsiAnswers = {
  monthly_income: 0,
  monthly_invest: 0,
  emergency_months: 0,
  current_savings: 0,
  total_debt: 0,
  monthly_debt: 0,
  dependents: 0,
  experience: 'none',
  risk_appetite: 'low',
  horizon: 'medium',
};

export const EXPERIENCE_LABELS: Record<Experience, string> = {
  none: 'New to investing',
  some: 'Some experience',
  experienced: 'Experienced investor',
};
export const RISK_LABELS: Record<RiskAppetite, string> = {
  low: 'Cautious — protect my capital',
  medium: 'Balanced — some ups and downs are fine',
  high: 'Adventurous — chase higher growth',
};
export const HORIZON_LABELS: Record<Horizon, string> = {
  short: 'Short — under 3 years',
  medium: 'Medium — 3 to 7 years',
  long: 'Long — over 7 years',
};
export const RISK_PROFILE_LABELS: Record<RiskProfile, string> = {
  conservative: 'Conservative',
  moderate: 'Moderate',
  balanced: 'Balanced',
  growth: 'Growth',
  aggressive: 'Aggressive',
};

// Each of the four pillars is scored out of 25, so the total lands in 0..100.
export const PILLAR_MAX = 25;
export const PILLARS: { key: keyof SubScores; label: string; icon: string; hint: string }[] = [
  { key: 'savings', label: 'Savings rate', icon: 'fa-piggy-bank', hint: 'How much of your income you set aside each month' },
  { key: 'emergency', label: 'Safety net', icon: 'fa-shield-halved', hint: 'Months of expenses your emergency fund covers' },
  { key: 'debt', label: 'Debt load', icon: 'fa-scale-balanced', hint: 'How light your monthly repayments are vs income' },
  { key: 'investing', label: 'Investing readiness', icon: 'fa-seedling', hint: 'Experience, time horizon and risk appetite' },
];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const pos = (n: any) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

export function bandFor(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Average';
  return 'Needs improvement';
}

export function computeMsi(raw: MsiAnswers): MsiResult {
  const a: MsiAnswers = { ...EMPTY_ANSWERS, ...raw };
  const income = pos(a.monthly_income);
  const invest = pos(a.monthly_invest);
  const emMonths = pos(a.emergency_months);
  const monthlyDebt = pos(a.monthly_debt);

  // 1) Savings rate — target 20%+ of income invested/saved each month = full marks.
  const savingsRate = income > 0 ? invest / income : 0;
  const savings = clamp((savingsRate / 0.2) * PILLAR_MAX, 0, PILLAR_MAX);

  // 2) Safety net — target 6 months of expenses covered = full marks.
  const emergency = clamp((emMonths / 6) * PILLAR_MAX, 0, PILLAR_MAX);

  // 3) Debt load — repayment-to-income ratio; lower is better. 0% = 25, 45%+ = 0.
  let debt: number;
  if (income > 0) {
    const dti = monthlyDebt / income;
    debt = clamp((1 - dti / 0.45) * PILLAR_MAX, 0, PILLAR_MAX);
  } else {
    debt = monthlyDebt > 0 ? 0 : PILLAR_MAX / 2; // unknown income -> neutral
  }

  // 4) Investing readiness — experience + time horizon + a defined risk appetite.
  const expPts = a.experience === 'experienced' ? 9 : a.experience === 'some' ? 6 : 2;
  const horPts = a.horizon === 'long' ? 9 : a.horizon === 'medium' ? 6 : 2;
  const riskPts = a.risk_appetite === 'high' ? 7 : a.risk_appetite === 'medium' ? 6 : 4;
  const investing = clamp(expPts + horPts + riskPts, 0, PILLAR_MAX);

  const sub_scores: SubScores = {
    savings: Math.round(savings),
    emergency: Math.round(emergency),
    debt: Math.round(debt),
    investing: Math.round(investing),
  };
  const wellness_score = clamp(Math.round(savings + emergency + debt + investing), 0, 100);
  const wellness_band = bandFor(wellness_score);

  // Risk profile from appetite + horizon (0..4 -> conservative..aggressive).
  const riskIdx =
    (a.risk_appetite === 'high' ? 2 : a.risk_appetite === 'medium' ? 1 : 0) +
    (a.horizon === 'long' ? 2 : a.horizon === 'medium' ? 1 : 0);
  const riskOrder: RiskProfile[] = ['conservative', 'moderate', 'balanced', 'growth', 'aggressive'];
  const risk_profile = riskOrder[clamp(riskIdx, 0, 4)];

  const RETURN_BY_PROFILE: Record<RiskProfile, number> = {
    conservative: 6,
    moderate: 7.5,
    balanced: 9,
    growth: 11,
    aggressive: 13,
  };
  const planning_return = RETURN_BY_PROFILE[risk_profile];

  // Recommendations — surface the weakest pillars first; always return at least one.
  const recs: string[] = [];
  if (sub_scores.savings < 18)
    recs.push(
      'Aim to channel at least 20% of your monthly income into savings or AWIVEST contributions. Automating a fixed amount each month makes this far easier to sustain.'
    );
  if (sub_scores.emergency < 18)
    recs.push(
      'Build an emergency fund covering 3 to 6 months of expenses before taking on higher-risk investments, so a surprise never forces you to sell at a loss.'
    );
  if (sub_scores.debt < 18)
    recs.push(
      'Your monthly debt repayments are high relative to your income. Prioritise clearing higher-interest debt to free up cash for investing.'
    );
  if (sub_scores.investing < 18)
    recs.push(
      'Grow your investing confidence with AWIVEST learning resources, and consider a longer time horizon so compounding can work in your favour.'
    );
  if (recs.length === 0)
    recs.push(
      'You are on a strong financial footing. Keep contributing consistently and revisit this profile each year to stay on track toward your goals.'
    );

  return {
    wellness_score,
    wellness_band,
    sub_scores,
    risk_profile,
    planning_return,
    recommendations: recs.slice(0, 3),
  };
}
