import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canDisburseFunds, canViewStaffConsole } from '@/lib/roles';
import FundDataConsole from './FundDataConsole';

export const dynamic = 'force-dynamic';

export default async function FundDataPage({
  searchParams,
}: {
  searchParams: { ok?: string; err?: string; updated?: string; failed?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!canViewStaffConsole(me?.role)) redirect('/staff');

  // Members (excludes the two pooled fund accounts) — contributions and
  // withdrawals post against members here.
  const { data: rows } = await supabase
    .from('member_finances')
    .select('member_no, full_name, status, refund_status, refund_on_exit, current_balance, contributions_2026, withdrawal')
    .neq('status', 'account')
    .neq('status', 'sample')
    .order('member_no', { ascending: true });

  // The two pooled fund accounts (Membership fees, Welfare). Membership/welfare
  // payments post against these, and their live balances are shown on the console.
  const { data: accountRows } = await supabase
    .from('member_finances')
    .select('member_no, full_name, status, current_balance, contributions_2026, total_interest_2026, opening_balance_2025')
    .eq('status', 'account')
    .order('member_no', { ascending: true });

  return (
    <FundDataConsole
      members={(rows ?? []) as any[]}
      accounts={(accountRows ?? []) as any[]}
      canDisburse={canDisburseFunds(me?.role)}
      flash={{ ok: searchParams?.ok, err: searchParams?.err, updated: searchParams?.updated, failed: searchParams?.failed }}
    />
  );
}
