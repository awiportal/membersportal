import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PlanningClient from './PlanningClient';

export const dynamic = 'force-dynamic';

export default async function PlanningPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: fp }, { data: goals }] = await Promise.all([
    supabase
      .from('financial_profiles')
      .select('planning_return, risk_profile, wellness_score, wellness_band')
      .eq('member_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('goals').select('*').eq('member_id', user.id).order('created_at', { ascending: true }),
  ]);

  return (
    <PlanningClient
      hasProfile={!!fp}
      planningReturn={Number(fp?.planning_return ?? 9)}
      riskProfile={(fp?.risk_profile as string | null) ?? null}
      wellnessScore={fp?.wellness_score ?? null}
      wellnessBand={(fp?.wellness_band as string | null) ?? null}
      goals={goals ?? []}
    />
  );
}
