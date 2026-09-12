import * as XLSX from 'xlsx';

// Shared builder for the AWIVEST fund workbook. Produces a multi-tab .xlsx that
// mirrors the "AWI_Member_Contributions_Earnings" spreadsheet, populated LIVE
// from member_finances rows. Used by both the Reports export and the Fund records
// export so the two downloads are identical.
//
// STANDING RULE: money is kept at exact cents — no rounding or truncation. All
// monetary cells are emitted as raw numbers so Excel treats them as numbers.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MLBL = ['Jan-26', 'Feb-26', 'Mar-26', 'Apr-26', 'May-26', 'Jun-26', 'Jul-26', 'Aug-26', 'Sep-26', 'Oct-26', 'Nov-26', 'Dec-26'];

type Cell = string | number | null;
type AOA = Cell[][];

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
// Number-or-null: keeps genuinely empty cells blank rather than forcing 0.
function nz(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
function titleCase(s: string): string {
  const t = String(s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

function isAccount(r: any): boolean {
  return r.status === 'account';
}
function isExit(r: any): boolean {
  return r.status === 'exiting' || r.status === 'exited';
}

function sortByMemberNo(a: any, b: any): number {
  return String(a.member_no || '').localeCompare(String(b.member_no || ''), undefined, { numeric: true });
}

export function buildFundWorkbook(list: any[]): Buffer {
  const all = Array.isArray(list) ? [...list] : [];
  const members = all.filter((r) => !isAccount(r)).sort(sortByMemberNo);
  const accounts = all.filter(isAccount);
  const fees = accounts.find((r) => r.member_no === 'ACC-FEES' || /member.*fee/i.test(String(r.full_name)));
  const welfare = accounts.find((r) => r.member_no === 'ACC-WELFARE' || /welfare/i.test(String(r.full_name)));

  const sumM = (f: (r: any) => number) => members.reduce((s, r) => s + f(r), 0);
  const sumAll = (f: (r: any) => number) => all.reduce((s, r) => s + f(r), 0);

  const generatedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // ------------------------------------------------------------------ Sheet 1
  // Member Register — master list + register totals + pooled membership fees.
  const memberOpeningTotal = sumM((r) => n(r.opening_balance_2025));
  const feesOpening = fees ? n(fees.opening_balance_2025) : 0;
  const reg: AOA = [];
  reg.push(['AWIVEST LTD  -  Member Register']);
  reg.push(['Master list of AWIVEST members (live from the register). Opening balances are as at 31 Dec 2025.']);
  reg.push([]);
  reg.push(['#', 'Member No.', 'Member Name', 'Status', 'Membership Fee Paid', 'Annual Goal (KES)', 'Opening Balance 31 Dec 2025 (KES)', 'Current Balance (KES)']);
  members.forEach((r, i) => {
    reg.push([i + 1, r.member_no, r.full_name, titleCase(r.status), nz(r.membership_fee_paid), nz(r.annual_goal), nz(r.opening_balance_2025), nz(r.current_balance)]);
  });
  reg.push([]);
  reg.push(['', '', 'TOTAL (members)', '', '', '', memberOpeningTotal, sumM((r) => n(r.current_balance))]);
  reg.push(['', '', 'Membership fees (pooled)', '', '', '', feesOpening, fees ? n(fees.current_balance) : 0]);
  if (welfare) reg.push(['', '', 'Welfare (pooled)', '', '', '', n(welfare.opening_balance_2025), n(welfare.current_balance)]);
  reg.push(['', '', 'Fund total', '', '', '', memberOpeningTotal + feesOpening + (welfare ? n(welfare.opening_balance_2025) : 0), sumAll((r) => n(r.current_balance))]);
  const wsReg = XLSX.utils.aoa_to_sheet(reg);
  wsReg['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 26 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 28 }, { wch: 20 }];

  // ------------------------------------------------------------------ Sheet 2
  // Member Statements — a data view of the per-member statement fields.
  const stmt: AOA = [];
  stmt.push(['AWIVEST LTD  -  Member Statements (all members)']);
  stmt.push(['As at 31 Jul 2026 (KES). Growth = current balance - opening balance.']);
  stmt.push([]);
  stmt.push(['#', 'Member No.', 'Member Name', 'Status', 'Opening Balance (31 Dec 2025)', 'Contributions (2026 YTD)', 'Total Interest', 'Withdrawal', 'Current Balance', 'Refund on Exit', 'Growth since 31 Dec 2025']);
  members.forEach((r, i) => {
    const growth = n(r.current_balance) - n(r.opening_balance_2025);
    stmt.push([i + 1, r.member_no, r.full_name, titleCase(r.status), nz(r.opening_balance_2025), nz(r.contributions_2026), nz(r.total_interest_2026), nz(r.withdrawal), nz(r.current_balance), nz(r.refund_on_exit), growth]);
  });
  const wsStmt = XLSX.utils.aoa_to_sheet(stmt);
  wsStmt['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 26 }, { wch: 10 }, { wch: 24 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 22 }];

  // ------------------------------------------------------------------ Sheet 3
  // Summary — live fund reconciliation.
  const active = members.filter((r) => r.status === 'active').length;
  const exiting = members.filter((r) => r.status === 'exiting').length;
  const exited = members.filter((r) => r.status === 'exited').length;
  const contributions = sumM((r) => n(r.contributions_2026));
  const interestAll = sumAll((r) => n(r.total_interest_2026));
  const britam = sumAll((r) => n(r.britam_interest_life));
  const jubilee = sumAll((r) => n(r.jubilee_mmf) + n(r.jubilee_fif) + n(r.jubilee_fif_apr_jul));
  const membersFundValueActive = members.filter((r) => r.status === 'active').reduce((s, r) => s + n(r.current_balance), 0);
  const fundTotal = sumAll((r) => n(r.current_balance));
  const totalExclExits = sumAll((r) => (isExit(r) ? 0 : n(r.current_balance)));
  const refundsPaid = sumAll((r) => (isExit(r) ? n(r.withdrawal) : 0));
  const collectiveGoal = sumM((r) => n(r.annual_goal));
  const membersCurrentTotal = sumM((r) => n(r.current_balance));
  const sm: AOA = [];
  sm.push(['AWIVEST LTD  -  Fund Summary']);
  sm.push(['Fund value, contributions, interest and reconciliation (live).']);
  sm.push([]);
  sm.push(['2026 - Live position', '']);
  sm.push(['Active members', active]);
  sm.push(['Exiting members (refund in process)', exiting]);
  sm.push(['Exited members (refunded)', exited]);
  sm.push(['Contributions received 2026 (YTD)', contributions]);
  sm.push(['Britam interest (posted)', britam]);
  sm.push(['Jubilee interest (posted)', jubilee]);
  sm.push(['Total interest earned (posted)', interestAll]);
  sm.push(['Refunds paid to exiting/exited members', refundsPaid]);
  sm.push(['Members fund value (active)', membersFundValueActive]);
  sm.push(['Membership fees (pooled account)', fees ? n(fees.current_balance) : 0]);
  sm.push(['Welfare (pooled account)', welfare ? n(welfare.current_balance) : 0]);
  sm.push(['Current total fund (incl. accounts)', fundTotal]);
  sm.push(['Total excl. exits', totalExclExits]);
  sm.push([]);
  sm.push(['Goal tracking', '']);
  sm.push(['Collective annual goal', collectiveGoal]);
  sm.push(['Progress to collective goal', collectiveGoal ? contributions / collectiveGoal : 0]);
  sm.push([]);
  sm.push(['Reconciliation', '']);
  sm.push(['Sum of members\u2019 current balances', membersCurrentTotal]);
  sm.push(['Add: Membership fees (pooled)', fees ? n(fees.current_balance) : 0]);
  sm.push(['Add: Welfare (pooled)', welfare ? n(welfare.current_balance) : 0]);
  sm.push(['Current total fund', fundTotal]);
  const exits = members.filter(isExit).sort(sortByMemberNo);
  if (exits.length) {
    sm.push([]);
    sm.push(['Members flagged for exit (pending refund)', '']);
    exits.forEach((r) => {
      sm.push([`${r.full_name} (${r.member_no}) - current balance`, n(r.current_balance)]);
      if (n(r.withdrawal) > 0) sm.push(['   of which already withdrawn', n(r.withdrawal)]);
    });
  }
  sm.push([]);
  sm.push([`Generated ${generatedAt} - AWIVEST fund workbook`, '']);
  const wsSum = XLSX.utils.aoa_to_sheet(sm);
  wsSum['!cols'] = [{ wch: 42 }, { wch: 20 }];

  // ------------------------------------------------------------------ Sheet 4
  // Compiled 2018 - Jul 2026 — contributions + interest components + totals,
  // with Membership fees + Welfare rows and a fund-total row.
  const cmp: AOA = [];
  cmp.push(['AWIVEST LTD  -  Compiled Member Statements 2018 - Jul 2026 (KES)']);
  cmp.push(['All members + Membership fees + Welfare. TOTAL excl Exits excludes members flagged exiting/exited.']);
  cmp.push([]);
  const cmpHeader = ['#', 'Member Name', 'Contributions', 'Interest 2018-2023', 'Britam Interest (2024-Jul 2026)', 'Jubilee MMF Interest (2024-Jul 2026)', 'Jubilee FIF (2024-Jul 2026)', 'Jubilee FIF (Apr-Jul 2026)', 'Total Interest', 'Withdrawal', 'TOTAL', 'TOTAL excl Exits'];
  cmp.push(cmpHeader);
  const compiledSourceRows: any[] = [...members];
  if (fees) compiledSourceRows.push(fees);
  if (welfare) compiledSourceRows.push(welfare);
  compiledSourceRows.forEach((r, i) => {
    const contrib = r.lifetime_contributions != null ? n(r.lifetime_contributions) : n(r.opening_balance_2025);
    const wd = n(r.withdrawal);
    cmp.push([
      i + 1,
      r.full_name,
      nz(contrib),
      nz(r.interest_2018_2023),
      nz(r.britam_interest_life),
      nz(r.jubilee_mmf),
      nz(r.jubilee_fif),
      nz(r.jubilee_fif_apr_jul),
      nz(r.total_interest_2026),
      wd ? -wd : null,
      nz(r.current_balance),
      isExit(r) ? 0 : n(r.current_balance),
    ]);
  });
  const colSum = (idx: number) => cmp.slice(4).reduce((s, row) => s + n(row[idx]), 0);
  cmp.push([]);
  cmp.push(['', 'FUND TOTAL', colSum(2), colSum(3), colSum(4), colSum(5), colSum(6), colSum(7), colSum(8), colSum(9), colSum(10), colSum(11)]);
  const wsCmp = XLSX.utils.aoa_to_sheet(cmp);
  wsCmp['!cols'] = [{ wch: 5 }, { wch: 26 }, { wch: 15 }, { wch: 16 }, { wch: 20 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];

  // ------------------------------------------------------------------ Sheet 5
  // 2026 Contribution Schedule — monthly grid + total + goal + balance to goal.
  const sch: AOA = [];
  sch.push(['AWIVEST LTD  -  AWI Investment 2026 Contribution Schedule (KES)']);
  sch.push(['Monthly amounts are NOT fixed; members contribute varying amounts when able. 300,000 is the ANNUAL target per member.']);
  sch.push([]);
  sch.push(['#', 'Member Name', ...MLBL, 'Total', 'Annual Goal', 'Balance to Goal']);
  const schedRows: any[] = [...members];
  if (fees) schedRows.push(fees);
  if (welfare) schedRows.push(welfare);
  schedRows.forEach((r, i) => {
    const s = r.sched_2026 && typeof r.sched_2026 === 'object' ? r.sched_2026 : {};
    const monthCells: Cell[] = MONTHS.map((m) => nz(s[m]));
    const total = n(r.contributions_2026);
    const goal = n(r.annual_goal);
    sch.push([i + 1, r.full_name, ...monthCells, total, goal || null, goal ? goal - total : null]);
  });
  const schColSum = (idx: number) => sch.slice(4).reduce((s, row) => s + n(row[idx]), 0);
  const monthTotals: Cell[] = MONTHS.map((_, idx) => schColSum(2 + idx));
  sch.push([]);
  sch.push(['', 'TOTAL', ...monthTotals, schColSum(2 + 12), schColSum(2 + 13), schColSum(2 + 14)]);
  const wsSch = XLSX.utils.aoa_to_sheet(sch);
  wsSch['!cols'] = [{ wch: 5 }, { wch: 26 }, ...MLBL.map(() => ({ wch: 11 })), { wch: 14 }, { wch: 13 }, { wch: 15 }];

  // ------------------------------------------------------------------- Assemble
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsReg, 'Member Register');
  XLSX.utils.book_append_sheet(wb, wsStmt, 'Member Statements');
  XLSX.utils.book_append_sheet(wb, wsSum, 'Summary');
  XLSX.utils.book_append_sheet(wb, wsCmp, 'Compiled 2018-Jul 2026');
  XLSX.utils.book_append_sheet(wb, wsSch, '2026 Contribution Schedule');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
