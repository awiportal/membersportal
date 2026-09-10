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

  // Full rows so the browser can render each members statement inline in a drawer.
  const { data: rows } = await supabase
    .from('member_finances')
    .select('*')
    .order('member_no', { ascending: true });

  return <StaffStatementsBrowser rows={(rows ?? []) as any[]} />;
}
