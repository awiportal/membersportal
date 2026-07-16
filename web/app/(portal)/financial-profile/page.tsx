import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import FinancialProfileClient from './FinancialProfileClient';

export const dynamic = 'force-dynamic';

export default async function FinancialProfilePage({
  searchParams,
}: {
  searchParams: { edit?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: fp } = await supabase
    .from('financial_profiles')
    .select('*')
    .eq('member_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return <FinancialProfileClient profile={fp ?? null} startEdit={searchParams?.edit === '1'} />;
}
