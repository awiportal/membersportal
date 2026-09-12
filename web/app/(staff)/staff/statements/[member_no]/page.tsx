import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';
import StatementView from './StatementView';

export const dynamic = 'force-dynamic';

export default async function StaffMemberStatement({ params, searchParams }: { params: { member_no: string }; searchParams: { print?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');

  const memberNo = decodeURIComponent(params.member_no);
  const { data: fin } = await supabase.from('member_finances').select('*').eq('member_no', memberNo).maybeSingle();
  if (!fin) notFound();

  return <StatementView fin={fin as any} autoPrint={searchParams?.print === '1'} />;
}
