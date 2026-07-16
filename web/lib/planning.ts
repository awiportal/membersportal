// web/lib/planning.ts
// Pure planning helpers: illustrative target asset mixes per risk profile and
// the maths behind the Planning Centre calculators. No server/client-only imports.

import type { RiskProfile } from '@/lib/msi';

export type Slice = { label: string; value: number; color: string };

// Illustrative target allocations (each sums to 100). Guidance only — NOT advice.
export const ASSET_MIX: Record<RiskProfile, Slice[]> = {
  conservative: [
    { label: 'Equities', value: 20, color: '#a6398f' },
    { label: 'Bonds & fixed income', value: 35, color: '#5aa9f0' },
    { label: 'Property', value: 10, color: '#a6cd35' },
    { label: 'Cash & money market', value: 30, color: '#37c98a' },
    { label: 'Alternatives', value: 5, color: '#f2b23b' },
  ],
  moderate: [
    { label: 'Equities', value: 35, color: '#a6398f' },
    { label: 'Bonds & fixed income', value: 30, color: '#5aa9f0' },
    { label: 'Property', value: 12, color: '#a6cd35' },
    { label: 'Cash & money market', value: 18, color: '#37c98a' },
    { label: 'Alternatives', value: 5, color: '#f2b23b' },
  ],
  balanced: [
    { label: 'Equities', value: 45, color: '#a6398f' },
    { label: 'Bonds & fixed income', value: 22, color: '#5aa9f0' },
    { label: 'Property', value: 15, color: '#a6cd35' },
    { label: 'Cash & money market', value: 10, color: '#37c98a' },
    { label: 'Alternatives', value: 8, color: '#f2b23b' },
  ],
  growth: [
    { label: 'Equities', value: 58, color: '#a6398f' },
    { label: 'Bonds & fixed income', value: 12, color: '#5aa9f0' },
    { label: 'Property', value: 15, color: '#a6cd35' },
    { label: 'Cash & money market', value: 5, color: '#37c98a' },
    { label: 'Alternatives', value: 10, color: '#f2b23b' },
  ],
  aggressive: [
    { label: 'Equities', value: 68, color: '#a6398f' },
    { label: 'Bonds & fixed income', value: 5, color: '#5aa9f0' },
    { label: 'Property', value: 12, color: '#a6cd35' },
    { label: 'Cash & money market', value: 3, color: '#37c98a' },
    { label: 'Alternatives', value: 12, color: '#f2b23b' },
  ],
};

const monthlyRate = (annualRatePct: number) => {
  const r = Number(annualRatePct);
  return Number.isFinite(r) && r > 0 ? r / 100 / 12 : 0;
};

export type GrowthResult = {
  projected: number; // ending balance
  contributed: number; // starting balance + all contributions
  growth: number; // projected - contributed
  yearly: number[]; // balance at end of each year, length years + 1 (index 0 = start)
};

// Compound growth of a starting balance plus a level monthly contribution
// (added at month end), at annualRatePct compounded monthly.
export function futureValue(opts: {
  monthly: number;
  years: number;
  annualRatePct: number;
  startingBalance?: number;
}): GrowthResult {
  const monthly = Math.max(0, Number(opts.monthly) || 0);
  const years = Math.max(0, Math.round(Number(opts.years) || 0));
  const start = Math.max(0, Number(opts.startingBalance) || 0);
  const i = monthlyRate(opts.annualRatePct);

  const balanceAt = (months: number): number => {
    const growthOfStart = i > 0 ? start * Math.pow(1 + i, months) : start;
    const growthOfContribs = i > 0 ? monthly * ((Math.pow(1 + i, months) - 1) / i) : monthly * months;
    return growthOfStart + growthOfContribs;
  };

  const yearly: number[] = [];
  for (let y = 0; y <= years; y++) yearly.push(Math.round(balanceAt(y * 12)));

  const projected = Math.round(balanceAt(years * 12));
  const contributed = start + monthly * years * 12;
  return { projected, contributed, growth: projected - contributed, yearly };
}

// Level monthly contribution needed to reach `target` in `years`, given `saved`
// already banked and compounding at annualRatePct.
export function requiredMonthly(opts: {
  target: number;
  saved: number;
  years: number;
  annualRatePct: number;
}): number {
  const target = Math.max(0, Number(opts.target) || 0);
  const saved = Math.max(0, Number(opts.saved) || 0);
  const n = Math.max(0, Math.round((Number(opts.years) || 0) * 12));
  const i = monthlyRate(opts.annualRatePct);
  if (n <= 0) return 0;
  const future = target - (i > 0 ? saved * Math.pow(1 + i, n) : saved);
  if (future <= 0) return 0;
  const pmt = i > 0 ? (future * i) / (Math.pow(1 + i, n) - 1) : future / n;
  return Math.max(0, Math.round(pmt));
}

// What a sum today grows to (in future money) at a given inflation rate.
export function inflate(opts: { amount: number; years: number; ratePct: number }): {
  future: number;
  yearly: number[];
} {
  const amount = Math.max(0, Number(opts.amount) || 0);
  const years = Math.max(0, Math.round(Number(opts.years) || 0));
  const r = Number(opts.ratePct) > 0 ? Number(opts.ratePct) / 100 : 0;
  const yearly: number[] = [];
  for (let y = 0; y <= years; y++) yearly.push(Math.round(amount * Math.pow(1 + r, y)));
  return { future: Math.round(amount * Math.pow(1 + r, years)), yearly };
}
