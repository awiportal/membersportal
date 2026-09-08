'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Record this member's interest in an opportunity. RLS (opp_int_owner) permits a
// member to insert a row for herself. Idempotent: a second click is a no-op.
export async function expressInterest(formData: FormData) {
  const oppId = String(formData.get('opportunity_id') || '');
  if (!oppId) return;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

  const { data: existing } = await supabase
    .from('opportunity_interests')
    .select('id')
    .eq('opportunity_id', oppId)
    .eq('member_id', uid)
    .limit(1);

  if (!existing || existing.length === 0) {
    const { error } = await supabase.from('opportunity_interests').insert({ opportunity_id: oppId, member_id: uid });
    if (error) console.error('expressInterest failed:', error.message);
  }

  revalidatePath('/opportunities');
}
