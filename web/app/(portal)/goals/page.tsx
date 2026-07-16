import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import GoalsClient from './GoalsClient';

export const dynamic = 'force-dynamic';

export default async function GoalsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: goals }, { data: fp }] = await Promise.all([
    supabase.from('goals').select('*').eq('member_id', user.id).order('created_at', { ascending: true }),
    supabase
      .from('financial_profiles')
      .select('planning_return, risk_profile')
      .eq('member_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <GoalsClient
      goals={goals ?? []}
      planningReturn={Number(fp?.planning_return ?? 9)}
      riskProfile={(fp?.risk_profile as string | null) ?? null}
      hasProfile={!!fp}
    />
  );
}
