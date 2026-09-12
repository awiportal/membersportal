'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Acceptance of a staff-published agreement document: typed full name plus an
// optional drawn or uploaded signature image (data URL). Mirrors the onboarding
// typed-name signing path. RLS (agreement_acc_owner) permits a member to write
// her own acceptance.
export async function signAgreementDoc(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const uid = user.id;

  const agreement_id = String(formData.get('agreement_id') || '');
  const signed_name = String(formData.get('signed_name') || '').trim();
  const signature_image = String(formData.get('signature_image') || '');
  const signature_kind = String(formData.get('signature_kind') || '');
  if (!agreement_id || !signed_name) {
    redirect('/agreements');
  }

  const base: Record<string, unknown> = {
    member_id: uid,
    agreement_id,
    signed_name,
    signed_at: new Date().toISOString(),
  };
  const full = signature_image
    ? { ...base, signature_image, signature_kind: signature_kind || 'draw' }
    : base;

  let { error } = await supabase
    .from('agreement_acceptances')
    .upsert(full, { onConflict: 'member_id,agreement_id' });

  // signature_image / signature_kind arrive with a migration. If it hasn't been
  // applied yet, retry with name only so signing keeps working in the meantime.
  if (error && signature_image) {
    console.error('signAgreementDoc with signature failed, retrying name-only:', error.message);
    ({ error } = await supabase
      .from('agreement_acceptances')
      .upsert(base, { onConflict: 'member_id,agreement_id' }));
  }
  if (error) console.error('signAgreementDoc failed:', error.message);
  revalidatePath('/agreements');
}
