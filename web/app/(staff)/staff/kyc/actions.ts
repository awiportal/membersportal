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
