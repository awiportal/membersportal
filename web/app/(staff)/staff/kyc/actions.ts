"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isStaff } from '@/lib/roles';

/**
 * Confirm the caller is signed-in staff before any privileged (service-role)
 * work. NB: is_admin() in the database covers only admin/superadmin, so a
 * secretary cannot read other members' KYC via row-level security — staff KYC
 * review therefore runs through the admin client, and THIS check is the access
 * boundary that authorises it.
 */
async function requireStaff(): Promise<{ userId: string } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You appear to be signed out. Please sign in again and retry.' };
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) {
    return { error: `Your account role is "${me?.role ?? 'none'}", which is not a staff role.` };
  }
  return { userId: user.id };
}

export async function getKycDocUrl(id: string): Promise<{ url?: string; ext?: string; error?: string }> {
  const gate = await requireStaff();
  if ('error' in gate) return { error: gate.error };
  const admin = createAdminClient();
  const { data: row } = await admin.from('kyc_documents').select('file_path').eq('id', id).maybeSingle();
  if (!row?.file_path) return { error: 'That document could not be found.' };
  const { data: signed, error } = await admin.storage.from('kyc').createSignedUrl(row.file_path, 300);
  if (error || !signed?.signedUrl) return { error: 'Could not prepare the file link. Please try again.' };
  const ext = String(row.file_path).split('.').pop()?.toLowerCase() || '';
  return { url: signed.signedUrl, ext };
}

export async function reviewKycDoc(formData: FormData): Promise<{ ok?: true; error?: string }> {
  const gate = await requireStaff();
  if ('error' in gate) return { error: gate.error };
  const id = String(formData.get('id') || '');
  const decision = String(formData.get('decision') || '');
  const comment = String(formData.get('comment') || '').trim() || null;
  if (!id) return { error: 'Missing document.' };
  if (decision !== 'approved' && decision !== 'rejected') return { error: 'Invalid decision.' };

  const admin = createAdminClient();
  const { data: row } = await admin.from('kyc_documents').select('member_id').eq('id', id).maybeSingle();
  const { error } = await admin
    .from('kyc_documents')
    .update({ status: decision, comment, reviewed_by: gate.userId, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: `Could not save the review: ${error.message}` };

  await admin.from('audit_log').insert({
    actor_id: gate.userId,
    member_id: row?.member_id ?? null,
    action: decision === 'approved' ? 'kyc_doc_approved' : 'kyc_doc_rejected',
    meta: { kyc_document_id: id },
  });

  revalidatePath('/staff/kyc');
  revalidatePath('/kyc');
  return { ok: true };
}

export async function setMemberKycStatus(formData: FormData): Promise<{ ok?: true; error?: string }> {
  const gate = await requireStaff();
  if ('error' in gate) return { error: gate.error };
  const memberId = String(formData.get('member_id') || '');
  const status = String(formData.get('status') || '');
  if (!memberId) return { error: 'Missing member.' };
  if (!['approved', 'rejected', 'pending'].includes(status)) return { error: 'Invalid status.' };

  const admin = createAdminClient();
  const { error } = await admin.from('profiles').update({ kyc_status: status }).eq('id', memberId);
  if (error) return { error: `Could not update the member's status: ${error.message}` };

  await admin.from('audit_log').insert({
    actor_id: gate.userId,
    member_id: memberId,
    action: 'kyc_status_set',
    meta: { status },
  });

  revalidatePath('/staff/kyc');
  revalidatePath('/kyc');
  return { ok: true };
}

const KYC_BUCKET = 'kyc';
const SAFE_KYC_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'pdf']);

/**
 * Staff-only: mint a short-lived signed upload URL so a chair/admin can upload a
 * KYC file ON BEHALF of a member. The file goes browser->Supabase directly (never
 * through this server action), which sidesteps serverless body limits and needs
 * no member-scoped storage RLS -- the signed URL authorises that one write.
 */
export async function createKycUploadUrl(
  formData: FormData,
): Promise<{ path?: string; token?: string; error?: string }> {
  const gate = await requireStaff();
  if ('error' in gate) return { error: gate.error };

  const memberId = String(formData.get('member_id') || '').trim();
  const docType = String(formData.get('doc_type') || '').trim();
  const rawExt = String(formData.get('ext') || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (memberId === '' || docType === '') return { error: 'Missing member or document type.' };
  const ext = SAFE_KYC_EXT.has(rawExt) ? rawExt : 'dat';

  const admin = createAdminClient();
  const path = `${memberId}/${docType}-${Date.now()}.${ext}`;
  const { data, error } = await admin.storage.from(KYC_BUCKET).createSignedUploadUrl(path);
  if (error || data?.token == null) {
    return { error: `Could not start the upload: ${error?.message || 'no token returned'}` };
  }
  return { path, token: data.token };
}

/**
 * Staff-only: after the on-behalf file lands in storage, record it. Mirrors the
 * member flow -- the old row for this doc_type is replaced and the member returns
 * to pending. This only ever downgrades; it can never approve a member.
 */
export async function recordKycDocOnBehalf(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const gate = await requireStaff();
  if ('error' in gate) return { error: gate.error };

  const memberId = String(formData.get('member_id') || '').trim();
  const docType = String(formData.get('doc_type') || '').trim();
  const filePath = String(formData.get('file_path') || '').trim();
  if (memberId === '' || docType === '' || filePath === '') return { error: 'Missing upload details.' };
  // The stored object must live in THIS member's own folder.
  if (filePath.startsWith(memberId + '/') === false) return { error: 'Upload path did not match the member.' };

  const admin = createAdminClient();
  await admin.from('kyc_documents').delete().eq('member_id', memberId).eq('doc_type', docType);
  const { error: insErr } = await admin
    .from('kyc_documents')
    .insert({ member_id: memberId, doc_type: docType, file_path: filePath, status: 'pending' });
  if (insErr) return { error: `Could not save the document: ${insErr.message}` };

  // A freshly uploaded file is unreviewed, so the member goes back to pending.
  await admin.from('profiles').update({ kyc_status: 'pending' }).eq('id', memberId);

  await admin.from('audit_log').insert({
    actor_id: gate.userId,
    member_id: memberId,
    action: 'kyc_doc_uploaded_on_behalf',
    meta: { doc_type: docType, file_path: filePath },
  });

  revalidatePath('/staff/kyc');
  revalidatePath('/kyc');
  return { ok: true };
}
