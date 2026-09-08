'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type SubmitResult = { ok: boolean; error?: string };

// Submit (or resubmit) a member's form. Called directly from the client fill
// component with the collected answers and an optional drawn signature. The
// signature (a PNG data URL) is uploaded to the private 'signatures' bucket
// under the member's own folder, which the storage RLS policy permits.
export async function submitForm(
  formId: string,
  answers: Record<string, unknown>,
  signatureDataUrl: string | null,
  signedName: string | null,
): Promise<SubmitResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Your session has expired. Please sign in again.' };
  const uid = user.id;

  let signaturePath: string | null = null;
  if (signatureDataUrl && signatureDataUrl.startsWith('data:image')) {
    const base64 = signatureDataUrl.split(',')[1] || '';
    if (base64) {
      const bytes = Buffer.from(base64, 'base64');
      const path = `${uid}/form-${formId}.png`;
      const { error: upErr } = await supabase.storage
        .from('signatures')
        .upload(path, bytes, { contentType: 'image/png', upsert: true });
      if (!upErr) signaturePath = path;
    }
  }

  const payload = {
    form_id: formId,
    member_id: uid,
    answers: (signedName ? { ...answers, _signed_name: signedName } : answers) as Record<string, unknown>,
    signature_path: signaturePath,
    status: 'submitted' as const,
    submitted_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from('form_submissions')
    .select('id')
    .eq('form_id', formId)
    .eq('member_id', uid)
    .limit(1);

  const res =
    existing && existing.length
      ? await supabase.from('form_submissions').update(payload).eq('id', existing[0].id)
      : await supabase.from('form_submissions').insert(payload);

  if (res.error) return { ok: false, error: res.error.message };

  revalidatePath('/forms');
  return { ok: true };
}
