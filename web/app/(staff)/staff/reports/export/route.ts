import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';
import { buildFundWorkbook } from '@/lib/fundWorkbook';

export const dynamic = 'force-dynamic';

// Full AWIVEST fund workbook (Member Register, Member Statements, Summary,
// Compiled 2018-Jul 2026, 2026 Contribution Schedule) built live from
// member_finances. Mirrors the "AWI_Member_Contributions_Earnings" spreadsheet.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: rows } = await supabase.from('member_finances').select('*').order('member_no', { ascending: true });
  const buf = await buildFundWorkbook((rows ?? []) as any[]);
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="AWIVEST_Fund_Report_' + today + '.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
