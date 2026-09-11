import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';
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
  if (!isStaff(me?.role)) redirect('/staff');

  // Exclude the non-member fund accounts (Membership fees, Welfare) — you post
  // contributions/withdrawals against members, not against these accounts.
  const { data: rows } = await supabase
    .from('member_finances')
    .select('member_no, full_name, status, refund_status, refund_on_exit, current_balance, contributions_2026, withdrawal')
    .neq('status', 'account')
    .order('member_no', { ascending: true });

  return (
    <FundDataConsole
      members={(rows ?? []) as any[]}
      flash={{ ok: searchParams?.ok, err: searchParams?.err, updated: searchParams?.updated, failed: searchParams?.failed }}
    />
  );
}
