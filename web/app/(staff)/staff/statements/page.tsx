import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canViewStaffConsole } from '@/lib/roles';
import StaffStatementsBrowser from './StaffStatementsBrowser';

export const dynamic = 'force-dynamic';

export default async function StaffStatementsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!canViewStaffConsole(me?.role)) redirect('/staff');

  // Full rows so the browser can render each member's statement inline in a drawer.
  // Exclude the two non-member fund accounts (Membership fees, Welfare) carried
  // with status 'account' — they have no personal statement and shouldn't inflate
  // the member counts (matches Fund data and Reports).
  // Also exclude preview/sample rows (status 'sample') so a demo duplicate never
  // double-counts a real member in the register count or Total balance. The
  // sample still shows to its own login via the member portal (keyed on member_id).
  const { data: rows } = await supabase
    .from('member_finances')
    .select('*')
    .neq('status', 'account')
    .neq('status', 'sample')
    .order('member_no', { ascending: true });

  return <StaffStatementsBrowser rows={(rows ?? []) as any[]} />;
}
