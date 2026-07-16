// web/lib/goals.ts
// Pure goal helpers + savings projection. No server/client-only imports, so it
// is safe to use in both the server action and the client component.

export const GOAL_CATEGORIES = [
  'Retirement',
  'Home',
  'Education',
  'Business',
  'Emergency fund',
  'Travel',
  'Vehicle',
  'Other',
] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export const GOAL_PRIORITIES = ['High', 'Medium', 'Low'] as const;
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];

export type GoalInput = {
  id?: string;
  name: string;
  category: string;
  priority: string;
  target_amount: number;
  saved_amount: number;
  target_date: string | null; // 'YYYY-MM-DD' or null
};

export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export type Projection = {
  monthsRemaining: number | null; // null when no target date
  requiredMonthly: number | null; // null when no target date or already reached
  metByGrowth: boolean; // current savings alone should reach the target in time
  overdue: boolean; // target date has passed and the goal is not yet reached
  reached: boolean; // saved >= target
  progressPct: number; // 0..100
};

// Required level monthly contribution to reach `target` by `targetDate`, given
// `saved` already banked and an assumed `annualRatePct` compounding monthly.
// Uses the future-value-of-an-annuity formula (contributions at month end).
export function projectGoal(opts: {
  target: number;
  saved: number;
  targetDate: string | null;
  annualRatePct: number;
  now?: Date;
}): Projection {
  const target = Math.max(0, Number(opts.target) || 0);
  const saved = Math.max(0, Number(opts.saved) || 0);
  const now = opts.now ?? new Date();
  const progressPct = target > 0 ? Math.max(0, Math.min(100, Math.round((saved / target) * 100))) : 0;
  const reached = target > 0 && saved >= target;

  if (reached) {
    return { monthsRemaining: null, requiredMonthly: null, metByGrowth: true, overdue: false, reached, progressPct };
  }
  if (!opts.targetDate) {
    return { monthsRemaining: null, requiredMonthly: null, metByGrowth: false, overdue: false, reached, progressPct };
  }

  const td = new Date(opts.targetDate + 'T00:00:00');
  const n = monthsBetween(now, td);
  if (!Number.isFinite(n) || n <= 0) {
    return { monthsRemaining: n, requiredMonthly: null, metByGrowth: false, overdue: true, reached, progressPct };
  }

  const i = annualRateToMonthly(opts.annualRatePct);
  const futureOfSaved = i > 0 ? saved * Math.pow(1 + i, n) : saved;
  const gap = target - futureOfSaved;
  if (gap <= 0) {
    return { monthsRemaining: n, requiredMonthly: 0, metByGrowth: true, overdue: false, reached, progressPct };
  }

  let monthly: number;
  if (i > 0) {
    const factor = (Math.pow(1 + i, n) - 1) / i;
    monthly = gap / factor;
  } else {
    monthly = gap / n;
  }
  return {
    monthsRemaining: n,
    requiredMonthly: Math.max(0, Math.round(monthly)),
    metByGrowth: false,
    overdue: false,
    reached,
    progressPct,
  };
}

function annualRateToMonthly(annualRatePct: number): number {
  const r = Number(annualRatePct);
  if (!Number.isFinite(r) || r <= 0) return 0;
  return r / 100 / 12;
}
