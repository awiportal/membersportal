'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { computeMsi, EMPTY_ANSWERS, MsiAnswers } from '@/lib/msi';

// Only keep the fields we recognise, coercing them to the right shape, so a
// stray client payload can never write arbitrary keys into the answers JSON.
function sanitize(input: any): MsiAnswers {
  const numeric: (keyof MsiAnswers)[] = [
    'monthly_income',
    'monthly_invest',
    'emergency_months',
    'current_savings',
    'total_debt',
    'monthly_debt',
    'dependents',
  ];
  const out: any = { ...EMPTY_ANSWERS };
  for (const k of numeric) {
    const v = Number(input?.[k]);
    out[k] = Number.isFinite(v) && v > 0 ? v : 0;
  }
  out.experience = ['none', 'some', 'experienced'].includes(input?.experience) ? input.experience : 'none';
  out.risk_appetite = ['low', 'medium', 'high'].includes(input?.risk_appetite) ? input.risk_appetite : 'low';
  out.horizon = ['short', 'medium', 'long'].includes(input?.horizon) ? input.horizon : 'medium';
  return out as MsiAnswers;
}

export async function saveFinancialProfile(input: MsiAnswers): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again.' };
  const uid = user.id;

  const answers = sanitize(input);
  const result = computeMsi(answers);

  const now = new Date();
  const reviewDue = new Date(now);
  reviewDue.setFullYear(reviewDue.getFullYear() + 1);

  const row = {
    member_id: uid,
    status: 'submitted' as const,
    answers,
    wellness_score: result.wellness_score,
    wellness_band: result.wellness_band,
    sub_scores: result.sub_scores,
    risk_profile: result.risk_profile,
    recommendations: result.recommendations,
    planning_return: result.planning_return,
    consent_at: now.toISOString(),
    submitted_at: now.toISOString(),
    review_due_at: reviewDue.toISOString(),
    updated_at: now.toISOString(),
  };

  // There is no unique constraint on member_id, so keep a single row per member
  // by updating the latest one when it exists and inserting otherwise.
  const { data: existing } = await supabase
    .from('financial_profiles')
    .select('id')
    .eq('member_id', uid)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let error: any = null;
  if (existing?.id) {
    ({ error } = await supabase.from('financial_profiles').update(row).eq('id', existing.id));
  } else {
    ({ error } = await supabase.from('financial_profiles').insert(row));
  }

  if (error) {
    console.error('saveFinancialProfile failed:', error.message);
    return { error: 'We could not save your profile just now. Please try again in a moment.' };
  }

  revalidatePath('/financial-profile');
  revalidatePath('/dashboard');
  return { ok: true };
}
