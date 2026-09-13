'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySequentialSignature } from '@/lib/sequentialSign';

// A member signs a document that was sent to them: typed full name plus a drawn
// OR uploaded signature (data URL). The write goes through the service-role
// admin client (members never write these rows directly), after verifying the
// row belongs to the caller and is still awaiting their signature.
export async function signSignRequest(formData: FormData): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const recipientId = String(formData.get('recipient_id') || '').trim();
  const member_signed_name = String(formData.get('member_signed_name') || '').trim();
  const image = String(formData.get('member_signature_image') || '');
  const kind = String(formData.get('member_signature_kind') || '') || 'draw';
  if (!recipientId || !member_signed_name) {
    revalidatePath('/sign-requests');
    return;
  }

  const admin = createAdminClient();
  const { data: rcpt } = await admin
    .from('sign_request_recipients')
    .select('id, member_id, status, request_id')
    .eq('id', recipientId)
    .single();

  // Only the intended member may sign, and only while it is still 'sent'.
  if (!rcpt || rcpt.member_id !== user.id || rcpt.status !== 'sent') {
    revalidatePath('/sign-requests');
    return;
  }

  const { error } = await admin
    .from('sign_request_recipients')
    .update({
      member_signed_name,
      member_signed_at: new Date().toISOString(),
      member_signature_image: image || null,
      member_signature_kind: image ? kind : null,
      status: 'signed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', recipientId);
  if (error) {
    console.error('signSignRequest: update failed:', error.message);
    revalidatePath('/sign-requests');
    return;
  }

  // Best-effort: notify the staff member who sent it that it is ready to countersign.
  try {
    const { data: req } = await admin
      .from('sign_requests')
      .select('title, created_by')
      .eq('id', rcpt.request_id)
      .maybeSingle();
    const createdBy = (req as any)?.created_by;
    if (createdBy) {
      await admin.from('notifications').insert({
        member_id: createdBy,
        type: 'agreement',
        title: 'Document signed - ready to countersign',
        body: `${member_signed_name} has signed ${(req as any)?.title || 'a document'}. It is ready for countersignature.`,
      });
    }
  } catch (e: any) {
    console.error('signSignRequest: notify step failed:', e?.message);
  }

  revalidatePath('/sign-requests');
}

// A participant signs THEIR ordered step of a sequential sign request. The
// shared helper verifies it is their active turn, records the signature, then
// advances the chain (or completes the request). Returns void, like
// signSignRequest.
export async function signSequentialStep(formData: FormData): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const step_id = String(formData.get('step_id') || '').trim();
  const signed_name = String(formData.get('signed_name') || '').trim();
  const signature_image = String(formData.get('signature_image') || '') || null;
  const signature_kind = String(formData.get('signature_kind') || '') || null;
  const signed_date = String(formData.get('signed_date') || '').trim() || undefined;

  if (!step_id || !signed_name) {
    revalidatePath('/sign-requests');
    return;
  }

  await applySequentialSignature({
    stepId: step_id,
    userId: user.id,
    signedName: signed_name,
    image: signature_image,
    kind: signature_kind,
    signedDate: signed_date,
  });

  revalidatePath('/sign-requests');
  revalidatePath('/staff/sign-requests');
}
