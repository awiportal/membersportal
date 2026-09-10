import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ContributionsClient from './ContributionsClient';

export const dynamic = 'force-dynamic';

export default async function ContributionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: fin } = await supabase
    .from('member_finances')
    .select('*')
    .eq('member_id', user.id)
    .maybeSingle();

  return <ContributionsClient fin={fin ?? null} />;
}
