'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { projectGoal, GOAL_CATEGORIES, GOAL_PRIORITIES, type GoalInput } from '@/lib/goals';

async function planningReturnFor(supabase: ReturnType<typeof createClient>, uid: string): Promise<number> {
  const { data } = await supabase
    .from('financial_profiles')
    .select('planning_return')
    .eq('member_id', uid)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const r = Number(data?.planning_return);
  return Number.isFinite(r) && r > 0 ? r : 9;
}

export async function saveGoal(input: GoalInput): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again.' };
  const uid = user.id;

  const name = String(input?.name || '').trim();
  if (!name) return { error: 'Please give your goal a name.' };

  const target = Math.max(0, Number(input?.target_amount) || 0);
  if (target <= 0) return { error: 'Please enter a target amount greater than zero.' };

  const saved = Math.max(0, Number(input?.saved_amount) || 0);
  const category = (GOAL_CATEGORIES as readonly string[]).includes(input?.category) ? input.category : 'Other';
  const priority = (GOAL_PRIORITIES as readonly string[]).includes(input?.priority) ? input.priority : 'Medium';
  const target_date = input?.target_date ? String(input.target_date).slice(0, 10) : null;

  const rate = await planningReturnFor(supabase, uid);
  const proj = projectGoal({ target, saved, targetDate: target_date, annualRatePct: rate });

  const row = {
    member_id: uid,
    name,
    category,
    priority,
    target_amount: target,
    saved_amount: saved,
    target_date,
    projected_monthly: proj.requiredMonthly,
    projected_rate: rate,
  };

  let error: any = null;
  if (input?.id) {
    // RLS also enforces ownership; the member_id filter is belt-and-braces.
    ({ error } = await supabase.from('goals').update(row).eq('id', input.id).eq('member_id', uid));
  } else {
    ({ error } = await supabase.from('goals').insert(row));
  }

  if (error) {
    console.error('saveGoal failed:', error.message);
    return { error: 'We could not save your goal just now. Please try again in a moment.' };
  }

  revalidatePath('/goals');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function deleteGoal(id: string): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again.' };

  if (!id) return { error: 'That goal could not be found.' };

  const { error } = await supabase.from('goals').delete().eq('id', id).eq('member_id', user.id);
  if (error) {
    console.error('deleteGoal failed:', error.message);
    return { error: 'We could not remove that goal just now. Please try again in a moment.' };
  }

  revalidatePath('/goals');
  revalidatePath('/dashboard');
  return { ok: true };
}
