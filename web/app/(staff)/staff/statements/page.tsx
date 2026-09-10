import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';
import StaffStatementsBrowser from './StaffStatementsBrowser';

export const dynamic = 'force-dynamic';

export default async function StaffStatementsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');

  const { data: rows } = await supabase
    .from('member_finances')
    .select('member_no, full_name, status, refund_status, current_balance, contributions_2026, total_interest_2026, member_id')
    .order('member_no', { ascending: true });

  return <StaffStatementsBrowser rows={(rows ?? []) as any[]} />;
}
