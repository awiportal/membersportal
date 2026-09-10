import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MLBL = ['Jan-26', 'Feb-26', 'Mar-26', 'Apr-26', 'May-26', 'Jun-26', 'Jul-26', 'Aug-26', 'Sep-26', 'Oct-26', 'Nov-26', 'Dec-26'];
const N = (v: any) => (v == null || isNaN(Number(v)) ? null : Number(v));

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: rows } = await supabase.from('member_finances').select('*').order('member_no', { ascending: true });
  const list = (rows ?? []) as any[];

  const register = list.map((r, i) => ({
    '#': i + 1,
    'Member No.': r.member_no,
    'Member Name': r.full_name,
    Status: r.status,
    'Annual Goal (KES)': N(r.annual_goal),
    'Opening Balance 31 Dec 2025': N(r.opening_balance_2025),
  }));

  const compiled = list.map((r, i) => ({
    '#': i + 1,
    'Member Name': r.full_name,
    Contributions: N(r.lifetime_contributions),
    'Interest 2018-2023': N(r.interest_2018_2023),
    'Britam Interest': N(r.britam_interest_life),
    'Jubilee MMF Interest': N(r.jubilee_mmf),
    'Jubilee FIF': N(r.jubilee_fif),
    'Jubilee FIF (Apr-Jul 2026)': N(r.jubilee_fif_apr_jul),
    'Total Interest': N(r.total_interest_2026),
    Withdrawal: N(r.withdrawal),
    TOTAL: N(r.current_balance),
  }));

  const schedule = list.map((r, i) => {
    const s = r.sched_2026 && typeof r.sched_2026 === 'object' ? r.sched_2026 : {};
    const o: any = { '#': i + 1, 'Member Name': r.full_name };
    MONTHS.forEach((m, idx) => {
      o[MLBL[idx]] = N(s[m]);
    });
    o.Total = N(r.contributions_2026);
    o['Annual Goal'] = N(r.annual_goal);
    return o;
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(register), 'Member Register');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(compiled), 'Compiled 2018-Jul 2026');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(schedule), '2026 Contribution Schedule');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="AWI_Member_Contributions_Earnings_' + today + '.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
