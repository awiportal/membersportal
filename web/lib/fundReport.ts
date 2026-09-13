// Shared live-fund aggregation for the reports suite (#156). Mirrors the exact
// formulas used by /staff/reports so every generated report reconciles to the
// dashboard. Source of truth: member_finances (RLS: staff / auditor read).

export type FinRow = {
  member_no: string;
  full_name: string;
  status: string;
  opening_balance_2025: number;
  contributions_2026: number;
  total_interest_2026: number;
  current_balance: number;
  refund_on_exit: number | null;
  withdrawal: number | null;
  britam_interest_life: number | null;
  jubilee_mmf: number | null;
  jubilee_fif: number | null;
  jubilee_fif_apr_jul: number | null;
};

// Column list to SELECT from member_finances for any report.
export const FIN_COLUMNS =
  'member_no, full_name, status, opening_balance_2025, contributions_2026, total_interest_2026, current_balance, refund_on_exit, withdrawal, britam_interest_life, jubilee_mmf, jubilee_fif, jubilee_fif_apr_jul';

export const n = (v: unknown) => Number(v || 0);

export function isAccount(r: FinRow) {
  return r.status === 'account';
}
export function isExit(r: FinRow) {
  return r.status === 'exiting' || r.status === 'exited';
}

export type FundSummary = ReturnType<typeof computeFundSummary>;

// Aggregate the register live. Identical maths to app/(staff)/staff/reports.
export function computeFundSummary(all: FinRow[]) {
  // Sample/preview rows never affect any figure.
  const rows = (all || []).filter((r) => r.status !== 'sample');
  const members = rows.filter((r) => isAccount(r) === false);
  const accounts = rows.filter(isAccount);
  const sum = (f: (r: FinRow) => number) => rows.reduce((s, r) => s + f(r), 0);

  const total = sum((r) => n(r.current_balance)); // whole fund, incl. accounts
  const totalExclExits = sum((r) => (isExit(r) ? 0 : n(r.current_balance)));
  const contributions = sum((r) => n(r.contributions_2026));
  const interest = sum((r) => n(r.total_interest_2026));
  // Derive opening so the distribution always reconciles to the fund total.
  const opening = total - contributions - interest;
  const britam = sum((r) => n(r.britam_interest_life));
  const jubilee = sum((r) => n(r.jubilee_mmf) + n(r.jubilee_fif) + n(r.jubilee_fif_apr_jul));
  const priorInterest = Math.max(0, interest - britam - jubilee);
  const withdrawals = sum((r) => (isExit(r) ? n(r.withdrawal) : 0));
  const accountsTotal = accounts.reduce((s, r) => s + n(r.current_balance), 0);

  const active = members.filter((r) => r.status === 'active').length;
  const exiting = members.filter((r) => r.status === 'exiting').length;
  const exited = members.filter((r) => r.status === 'exited').length;

  const register = [...members].sort((a, b) =>
    String(a.member_no).localeCompare(String(b.member_no), undefined, { numeric: true })
  );
  const regTotals = {
    opening: register.reduce((s, r) => s + n(r.opening_balance_2025), 0),
    contributions: register.reduce((s, r) => s + n(r.contributions_2026), 0),
    interest: register.reduce((s, r) => s + n(r.total_interest_2026), 0),
    current: register.reduce((s, r) => s + n(r.current_balance), 0),
  };

  return {
    rows, members, accounts, total, totalExclExits, contributions, interest,
    opening, britam, jubilee, priorInterest, withdrawals, accountsTotal,
    active, exiting, exited, register, regTotals,
  };
}
