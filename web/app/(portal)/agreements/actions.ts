'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Typed-name acceptance of a staff-published agreement document. Mirrors the
// onboarding typed-name signing path. RLS (agreement_acc_owner) permits a member
// to write her own acceptance.
export async function signAgreementDoc(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

  const agreement_id = String(formData.get('agreement_id') || '');
  const signed_name = String(formData.get('signed_name') || '').trim();
  if (!agreement_id || !signed_name) {
    redirect('/agreements');
  }

  const { error } = await supabase.from('agreement_acceptances').upsert(
    { member_id: uid, agreement_id, signed_name, signed_at: new Date().toISOString() },
    { onConflict: 'member_id,agreement_id' }
  );
  if (error) console.error('signAgreementDoc failed:', error.message);
  revalidatePath('/agreements');
}
