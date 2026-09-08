'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function enrollWelfare() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

  const { data: existing } = await supabase.from('welfare_enrollments').select('id').eq('member_id', uid).limit(1);
  if (!existing || existing.length === 0) {
    await supabase.from('welfare_enrollments').insert({ member_id: uid, status: 'active' });
  } else {
    await supabase.from('welfare_enrollments').update({ status: 'active' }).eq('id', existing[0].id);
  }
  revalidatePath('/welfare');
}

export async function fileClaim(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

  const claim_type = String(formData.get('claim_type') || '').trim();
  const amountRaw = String(formData.get('amount') || '').trim();
  if (!claim_type) return;
  const amount = amountRaw ? Number(amountRaw.replace(/[^0-9.]/g, '')) || null : null;

  await supabase.from('welfare_claims').insert({ member_id: uid, claim_type, amount, status: 'pending' });
  revalidatePath('/welfare');
}
