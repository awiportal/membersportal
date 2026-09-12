import ExcelJS from 'exceljs';

// Shared builder for the AWIVEST fund workbook. Produces a styled, multi-tab
// .xlsx that mirrors the "AWI_Member_Contributions_Earnings" spreadsheet,
// populated LIVE from member_finances. Used by both the Reports export and the
// Fund records export so the two downloads are identical.
//
// STANDING RULE: money is kept at exact cents — no rounding or truncation. All
// monetary cells are emitted as raw numbers with a 2-decimal display format.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MLBL = ['Jan-26', 'Feb-26', 'Mar-26', 'Apr-26', 'May-26', 'Jun-26', 'Jul-26', 'Aug-26', 'Sep-26', 'Oct-26', 'Nov-26', 'Dec-26'];

// AWIVEST brand palette (ARGB).
const C = {
  purple: 'FF7E2674',
  purple2: 'FFA6398F',
  lime: 'FFA6CD35',
  limeSoft: 'FFEFF6D6',
  band: 'FFF7F2F6', // subtle zebra
  totalFill: 'FFEADAE6', // light purple for totals
  headText: 'FFFFFFFF',
  ink: 'FF241320',
  muted: 'FF7A6E77',
  border: 'FFE6DCE4',
  good: 'FF2E9E63',
  warn: 'FFB07A0E',
  bad: 'FFC0392B',
};
const MONEY = '#,##0.00';
const INT = '#,##0';
const PCT = '0.0%';

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
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
function statusColor(s: string): string {
  return s === 'active' ? C.good : s === 'exiting' ? C.warn : s === 'exited' ? C.bad : C.muted;
}

function solid(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
const thin = (argb = C.border): Partial<ExcelJS.Border> => ({ style: 'thin', color: { argb } });

// Title bar across `cols` columns.
function titleBar(ws: ExcelJS.Worksheet, rowIdx: number, cols: number, text: string) {
  ws.mergeCells(rowIdx, 1, rowIdx, cols);
  const cell = ws.getCell(rowIdx, 1);
  cell.value = text;
  cell.fill = solid(C.purple);
  cell.font = { bold: true, size: 15, color: { argb: C.headText } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(rowIdx).height = 30;
}
function subtitleBar(ws: ExcelJS.Worksheet, rowIdx: number, cols: number, text: string) {
  ws.mergeCells(rowIdx, 1, rowIdx, cols);
  const cell = ws.getCell(rowIdx, 1);
  cell.value = text;
  cell.fill = solid(C.limeSoft);
  cell.font = { italic: true, size: 10.5, color: { argb: C.ink } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  ws.getRow(rowIdx).height = 22;
}
function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = solid(C.purple2);
    cell.font = { bold: true, size: 11, color: { argb: C.headText } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { bottom: thin(C.purple) };
  });
  row.height = 30;
}
function bandRows(ws: ExcelJS.Worksheet, first: number, last: number, moneyCols: number[]) {
  for (let r = first; r <= last; r++) {
    const row = ws.getRow(r);
    if ((r - first) % 2 === 1) row.eachCell((cell) => { cell.fill = solid(C.band); });
    row.eachCell((cell) => {
      cell.border = { bottom: thin() };
      if (!cell.alignment) cell.alignment = { vertical: 'middle' };
    });
    moneyCols.forEach((c) => { ws.getCell(r, c).numFmt = MONEY; ws.getCell(r, c).alignment = { horizontal: 'right' }; });
  }
}
function totalRow(row: ExcelJS.Row, moneyCols: number[]) {
  row.eachCell((cell) => {
    cell.fill = solid(C.totalFill);
    cell.font = { bold: true, color: { argb: C.ink } };
    cell.border = { top: { style: 'medium', color: { argb: C.purple } }, bottom: thin(C.purple2) };
  });
  moneyCols.forEach((c) => { const cell = row.getCell(c); cell.numFmt = MONEY; cell.alignment = { horizontal: 'right' }; });
  row.height = 22;
}

export async function buildFundWorkbook(list: any[]): Promise<Buffer> {
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

  const wb = new ExcelJS.Workbook();
  wb.creator = 'AWIVEST Members Portal';
  wb.created = new Date();

  // ================================================================ Sheet 1
  const feesOpening = fees ? n(fees.opening_balance_2025) : 0;
  const welfareOpening = welfare ? n(welfare.opening_balance_2025) : 0;
  const memberOpeningTotal = sumM((r) => n(r.opening_balance_2025));

  const wsReg = wb.addWorksheet('Member Register', {
    views: [{ state: 'frozen', ySplit: 4 }],
    properties: { defaultRowHeight: 18 },
  });
  wsReg.columns = [{ width: 5 }, { width: 12 }, { width: 28 }, { width: 11 }, { width: 16 }, { width: 16 }, { width: 26 }, { width: 20 }];
  titleBar(wsReg, 1, 8, 'AWIVEST LTD  —  Member Register');
  subtitleBar(wsReg, 2, 8, 'Master list of AWIVEST members (live). Opening balances are as at 31 Dec 2025.');
  wsReg.addRow([]);
  const regHead = wsReg.addRow(['#', 'Member No.', 'Member Name', 'Status', 'Membership Fee Paid', 'Annual Goal (KES)', 'Opening Bal. 31 Dec 2025', 'Current Balance']);
  styleHeaderRow(regHead);
  const regFirst = 5;
  members.forEach((r, i) => {
    const row = wsReg.addRow([i + 1, r.member_no, r.full_name, titleCase(r.status), nz(r.membership_fee_paid), nz(r.annual_goal), nz(r.opening_balance_2025), nz(r.current_balance)]);
    row.getCell(4).font = { color: { argb: statusColor(r.status) }, bold: true };
  });
  const regLast = wsReg.rowCount;
  bandRows(wsReg, regFirst, regLast, [6, 7, 8]);
  wsReg.autoFilter = { from: { row: 4, column: 1 }, to: { row: regLast, column: 8 } };
  wsReg.addRow([]);
  const rt1 = wsReg.addRow(['', '', 'TOTAL (members)', '', '', '', memberOpeningTotal, sumM((r) => n(r.current_balance))]);
  totalRow(rt1, [7, 8]);
  const rt2 = wsReg.addRow(['', '', 'Membership fees (pooled)', '', '', '', feesOpening, fees ? n(fees.current_balance) : 0]);
  totalRow(rt2, [7, 8]);
  if (welfare) { const rt3 = wsReg.addRow(['', '', 'Welfare (pooled)', '', '', '', welfareOpening, n(welfare.current_balance)]); totalRow(rt3, [7, 8]); }
  const rt4 = wsReg.addRow(['', '', 'Fund total', '', '', '', memberOpeningTotal + feesOpening + welfareOpening, sumAll((r) => n(r.current_balance))]);
  totalRow(rt4, [7, 8]);
  rt4.eachCell((cell) => { cell.fill = solid(C.lime); cell.font = { bold: true, color: { argb: C.ink } }; });

  // ================================================================ Sheet 2
  const wsStmt = wb.addWorksheet('Member Statements', { views: [{ state: 'frozen', ySplit: 4 }] });
  wsStmt.columns = [{ width: 5 }, { width: 12 }, { width: 28 }, { width: 11 }, { width: 22 }, { width: 20 }, { width: 16 }, { width: 14 }, { width: 20 }, { width: 15 }, { width: 20 }];
  titleBar(wsStmt, 1, 11, 'AWIVEST LTD  —  Member Statements (all members)');
  subtitleBar(wsStmt, 2, 11, 'As at 31 Jul 2026 (KES). Growth = current balance − opening balance.');
  wsStmt.addRow([]);
  const stHead = wsStmt.addRow(['#', 'Member No.', 'Member Name', 'Status', 'Opening (31 Dec 2025)', 'Contributions 2026', 'Total Interest', 'Withdrawal', 'Current Balance', 'Refund on Exit', 'Growth']);
  styleHeaderRow(stHead);
  const stFirst = 5;
  members.forEach((r, i) => {
    const growth = n(r.current_balance) - n(r.opening_balance_2025);
    const row = wsStmt.addRow([i + 1, r.member_no, r.full_name, titleCase(r.status), nz(r.opening_balance_2025), nz(r.contributions_2026), nz(r.total_interest_2026), nz(r.withdrawal), nz(r.current_balance), nz(r.refund_on_exit), growth]);
    row.getCell(4).font = { color: { argb: statusColor(r.status) }, bold: true };
    row.getCell(11).font = { color: { argb: growth >= 0 ? C.good : C.bad } };
  });
  const stLast = wsStmt.rowCount;
  bandRows(wsStmt, stFirst, stLast, [5, 6, 7, 8, 9, 10, 11]);
  wsStmt.autoFilter = { from: { row: 4, column: 1 }, to: { row: stLast, column: 11 } };

  // ================================================================ Sheet 3
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

  const wsSum = wb.addWorksheet('Summary');
  wsSum.columns = [{ width: 44 }, { width: 22 }];
  titleBar(wsSum, 1, 2, 'AWIVEST LTD  —  Fund Summary');
  subtitleBar(wsSum, 2, 2, 'Fund value, contributions, interest and reconciliation (live).');
  wsSum.addRow([]);
  type SumItem = ['h' | 'i' | 'm' | 'p', string, number?];
  const section = (t: string): SumItem => ['h', t];
  const line = (t: string, v: number): SumItem => ['m', t, v];
  const intLine = (t: string, v: number): SumItem => ['i', t, v];
  const pctLine = (t: string, v: number): SumItem => ['p', t, v];
  const items: SumItem[] = [
    section('2026 — Live position'),
    intLine('Active members', active),
    intLine('Exiting members (refund in process)', exiting),
    intLine('Exited members (refunded)', exited),
    line('Contributions received 2026 (YTD)', contributions),
    line('Britam interest (posted)', britam),
    line('Jubilee interest (posted)', jubilee),
    line('Total interest earned (posted)', interestAll),
    line('Refunds paid to exiting/exited members', refundsPaid),
    line('Members fund value (active)', membersFundValueActive),
    line('Membership fees (pooled account)', fees ? n(fees.current_balance) : 0),
    line('Welfare (pooled account)', welfare ? n(welfare.current_balance) : 0),
    line('Current total fund (incl. accounts)', fundTotal),
    line('Total excl. exits', totalExclExits),
    section('Goal tracking'),
    line('Collective annual goal', collectiveGoal),
    pctLine('Progress to collective goal', collectiveGoal ? contributions / collectiveGoal : 0),
    section('Reconciliation'),
    line('Sum of members\u2019 current balances', membersCurrentTotal),
    line('Add: Membership fees (pooled)', fees ? n(fees.current_balance) : 0),
    line('Add: Welfare (pooled)', welfare ? n(welfare.current_balance) : 0),
    line('Current total fund', fundTotal),
  ];
  const exits = members.filter(isExit).sort(sortByMemberNo);
  if (exits.length) {
    items.push(section('Members flagged for exit (pending refund)'));
    exits.forEach((r) => {
      items.push(line(`${r.full_name} (${r.member_no}) — current balance`, n(r.current_balance)));
      if (n(r.withdrawal) > 0) items.push(line('   of which already withdrawn', n(r.withdrawal)));
    });
  }
  items.forEach((it) => {
    if (it[0] === 'h') {
      const row = wsSum.addRow([it[1], '']);
      wsSum.mergeCells(row.number, 1, row.number, 2);
      const cell = wsSum.getCell(row.number, 1);
      cell.fill = solid(C.purple2);
      cell.font = { bold: true, color: { argb: C.headText }, size: 11.5 };
      cell.alignment = { vertical: 'middle', indent: 1 };
      row.height = 24;
    } else {
      const row = wsSum.addRow([it[1], it[2] ?? 0]);
      row.getCell(1).font = { color: { argb: C.ink } };
      const vc = row.getCell(2);
      vc.alignment = { horizontal: 'right' };
      vc.font = { bold: true, color: { argb: C.ink } };
      vc.numFmt = it[0] === 'i' ? INT : it[0] === 'p' ? PCT : MONEY;
      row.getCell(1).border = { bottom: thin() };
      vc.border = { bottom: thin() };
    }
  });
  wsSum.addRow([]);
  const genRow = wsSum.addRow([`Generated ${generatedAt} — AWIVEST fund workbook`, '']);
  genRow.getCell(1).font = { italic: true, size: 9.5, color: { argb: C.muted } };

  // ================================================================ Sheet 4
  const wsCmp = wb.addWorksheet('Compiled 2018-Jul 2026', { views: [{ state: 'frozen', ySplit: 4 }] });
  wsCmp.columns = [{ width: 5 }, { width: 28 }, { width: 15 }, { width: 15 }, { width: 18 }, { width: 20 }, { width: 18 }, { width: 17 }, { width: 15 }, { width: 14 }, { width: 16 }, { width: 16 }];
  titleBar(wsCmp, 1, 12, 'AWIVEST LTD  —  Compiled Member Statements 2018 – Jul 2026 (KES)');
  subtitleBar(wsCmp, 2, 12, 'All members + Membership fees + Welfare. TOTAL excl Exits excludes members flagged exiting/exited.');
  wsCmp.addRow([]);
  const cmpHead = wsCmp.addRow(['#', 'Member Name', 'Contributions', 'Interest 2018-2023', 'Britam Interest', 'Jubilee MMF Interest', 'Jubilee FIF', 'Jubilee FIF (Apr-Jul)', 'Total Interest', 'Withdrawal', 'TOTAL', 'TOTAL excl Exits']);
  styleHeaderRow(cmpHead);
  const cmpFirst = 5;
  const compiledRows: any[] = [...members];
  if (fees) compiledRows.push(fees);
  if (welfare) compiledRows.push(welfare);
  const accountRowNumbers: number[] = [];
  compiledRows.forEach((r, i) => {
    const contrib = r.lifetime_contributions != null ? n(r.lifetime_contributions) : n(r.opening_balance_2025);
    const wd = n(r.withdrawal);
    const row = wsCmp.addRow([
      i + 1, r.full_name, nz(contrib), nz(r.interest_2018_2023), nz(r.britam_interest_life), nz(r.jubilee_mmf),
      nz(r.jubilee_fif), nz(r.jubilee_fif_apr_jul), nz(r.total_interest_2026), wd ? -wd : null,
      nz(r.current_balance), isExit(r) ? 0 : n(r.current_balance),
    ]);
    if (isAccount(r)) accountRowNumbers.push(row.number);
    if (wd) row.getCell(10).font = { color: { argb: C.bad } };
  });
  const cmpLast = wsCmp.rowCount;
  bandRows(wsCmp, cmpFirst, cmpLast, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  // Highlight the two pooled-account rows.
  accountRowNumbers.forEach((rn) => {
    wsCmp.getRow(rn).eachCell((cell) => { cell.fill = solid(C.limeSoft); });
    wsCmp.getRow(rn).getCell(2).font = { bold: true, color: { argb: C.purple } };
  });
  wsCmp.autoFilter = { from: { row: 4, column: 1 }, to: { row: cmpLast, column: 12 } };
  const colSumC = (idx: number) => { let s = 0; for (let r = cmpFirst; r <= cmpLast; r++) s += n(wsCmp.getCell(r, idx).value); return s; };
  wsCmp.addRow([]);
  const cmpTot = wsCmp.addRow(['', 'FUND TOTAL', colSumC(3), colSumC(4), colSumC(5), colSumC(6), colSumC(7), colSumC(8), colSumC(9), colSumC(10), colSumC(11), colSumC(12)]);
  totalRow(cmpTot, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

  // ================================================================ Sheet 5
  const wsSch = wb.addWorksheet('2026 Contribution Schedule', { views: [{ state: 'frozen', ySplit: 4, xSplit: 2 }] });
  wsSch.columns = [{ width: 5 }, { width: 26 }, ...MLBL.map(() => ({ width: 11 })), { width: 14 }, { width: 13 }, { width: 15 }];
  titleBar(wsSch, 1, 17, 'AWIVEST LTD  —  2026 Contribution Schedule (KES)');
  subtitleBar(wsSch, 2, 17, 'Monthly amounts are NOT fixed; members contribute varying amounts when able. 300,000 is the ANNUAL target per member.');
  wsSch.addRow([]);
  const schHead = wsSch.addRow(['#', 'Member Name', ...MLBL, 'Total', 'Annual Goal', 'Balance to Goal']);
  styleHeaderRow(schHead);
  const schFirst = 5;
  const schedRows: any[] = [...members];
  if (fees) schedRows.push(fees);
  if (welfare) schedRows.push(welfare);
  const moneyColsSch = Array.from({ length: 15 }, (_, i) => 3 + i); // Jan..Dec + Total + Goal + Balance
  schedRows.forEach((r, i) => {
    const s = r.sched_2026 && typeof r.sched_2026 === 'object' ? r.sched_2026 : {};
    const monthCells = MONTHS.map((m) => nz(s[m]));
    const total = n(r.contributions_2026);
    const goal = n(r.annual_goal);
    const balance = goal ? goal - total : null;
    const row = wsSch.addRow([i + 1, r.full_name, ...monthCells, total, goal || null, balance]);
    row.getCell(15).font = { bold: true, color: { argb: C.ink } }; // Total
    if (balance != null) row.getCell(17).font = { color: { argb: balance <= 0 ? C.good : C.muted } };
    if (isAccount(r)) row.getCell(2).font = { bold: true, color: { argb: C.purple } };
  });
  const schLast = wsSch.rowCount;
  bandRows(wsSch, schFirst, schLast, moneyColsSch);
  wsSch.autoFilter = { from: { row: 4, column: 1 }, to: { row: schLast, column: 17 } };
  const colSumS = (idx: number) => { let s = 0; for (let r = schFirst; r <= schLast; r++) s += n(wsSch.getCell(r, idx).value); return s; };
  wsSch.addRow([]);
  const schTot = wsSch.addRow(['', 'TOTAL', ...MONTHS.map((_, i) => colSumS(3 + i)), colSumS(15), colSumS(16), colSumS(17)]);
  totalRow(schTot, moneyColsSch);

  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}
