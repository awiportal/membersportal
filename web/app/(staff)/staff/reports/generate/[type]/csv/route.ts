import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canViewStaffConsole } from '@/lib/roles';
import { FIN_COLUMNS, computeFundSummary, n, isExit, type FinRow } from '@/lib/fundReport';
import { reportDef } from '@/lib/reportDefs';

export const dynamic = 'force-dynamic';

const WHT_RATE = 0.15;

function esc(v: string | number) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows: (string | number)[][]) {
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

// CSV export for each formal report (#156). Primary table only; the print/PDF
// view carries the full narrative. Same live source as the report page.
export async function GET(req: Request, { params }: { params: { type: string } }) {
  const type = params.type;
  const def = reportDef(type);
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (canViewStaffConsole(me?.role) === false) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!def) return NextResponse.json({ error: 'unknown report' }, { status: 404 });

  const { data: finData } = await supabase.from('member_finances').select(FIN_COLUMNS).order('member_no', { ascending: true });
  const S = computeFundSummary((finData ?? []) as FinRow[]);

  let table: (string | number)[][] = [];

  if (type === 'agm' || type === 'member') {
    table = [['Member No', 'Name', 'Status', 'Opening 2025', 'Contributions 2026', 'Interest 2026', 'Current Balance']];
    for (const r of S.register) {
      table.push([r.member_no, r.full_name, r.status, n(r.opening_balance_2025), n(r.contributions_2026), n(r.total_interest_2026), n(r.current_balance)]);
    }
    table.push(['Totals', '', '', S.regTotals.opening, S.regTotals.contributions, S.regTotals.interest, S.regTotals.current]);
  } else if (type === 'finance') {
    table = [
      ['Line', 'Amount (KES)'],
      ['Opening balance (to 2025)', S.opening],
      ['2026 contributions', S.contributions],
      ['2026 interest', S.interest],
      ['Current fund total', S.total],
      ['Withdrawals paid to exits', S.withdrawals],
      ['Britam interest', S.britam],
      ['Jubilee interest (MMF + FIF)', S.jubilee],
      ['Prior-year interest', S.priorInterest],
      ['Fund accounts total', S.accountsTotal],
    ];
  } else if (type === 'tax') {
    table = [['Member No', 'Name', 'Gross interest', 'WHT ' + (WHT_RATE * 100).toFixed(0) + '%', 'Net interest']];
    let g = 0, w = 0, net = 0;
    for (const r of S.register) {
      const gross = n(r.total_interest_2026);
      if (gross <= 0) continue;
      const wht = Math.round(gross * WHT_RATE * 100) / 100;
      const nt = gross - wht;
      g += gross; w += wht; net += nt;
      table.push([r.member_no, r.full_name, gross, wht, nt]);
    }
    table.push(['Totals', '', g, w, net]);
  } else if (type === 'audit') {
    table = [['Member No', 'Name', 'Opening 2025', 'Contributions', 'Interest', 'Withdrawal', 'Current', 'Expected', 'Difference']];
    for (const r of S.members) {
      const wd = isExit(r) ? n(r.withdrawal) : 0;
      const expected = n(r.opening_balance_2025) + n(r.contributions_2026) + n(r.total_interest_2026) - wd;
      table.push([r.member_no, r.full_name, n(r.opening_balance_2025), n(r.contributions_2026), n(r.total_interest_2026), wd, n(r.current_balance), expected, n(r.current_balance) - expected]);
    }
  } else if (type === 'committee') {
    const { data: mtg } = await supabase.from('meetings').select('*').order('scheduled_at', { ascending: false }).limit(200);
    table = [['Title', 'Type', 'Scheduled', 'Location', 'Status']];
    for (const m of ((mtg ?? []) as any[])) {
      table.push([m.title ?? '', m.meeting_type ?? '', m.scheduled_at ?? '', m.location ?? '', m.status ?? '']);
    }
  }

  const csv = toCsv(table);
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="AWIVEST_${type}_report_${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
