"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, describeServiceKey } from '@/lib/supabase/admin';
import { isStaff } from '@/lib/roles';

const DOC_TYPES = [
  'statement',
  'report',
  'certificate',
  'welfare_statement',
  'guide',
  'policy',
  'onboarding',
  'other',
];

/**
 * Confirm the caller is signed-in staff. Returns the caller's id on success,
 * or a friendly error string. Staff status is the security boundary before we
 * use the service-role admin client (which bypasses row-level security).
 */
async function requireStaff(): Promise<{ userId: string } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (\!user) return { error: 'You appear to be signed out. Please sign in again and retry.' };
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (\!isStaff(me?.role)) {
    return { error: `Your account role is "${me?.role ?? 'none'}", which is not a staff role.` };
  }
  return { userId: user.id };
}

export async function uploadDocument(formData: FormData): Promise<{ ok?: true; error?: string }> {
  const gate = await requireStaff();
  if ('error' in gate) return { error: gate.error };

  const title = String(formData.get('title') || '').trim();
  const type = String(formData.get('type') || 'other');
  const scope = String(formData.get('scope') || 'all');
  const memberId = String(formData.get('member_id') || '').trim();
  const file = formData.get('file');

  if (\!title) return { error: 'Please give the document a title.' };
  if (\!DOC_TYPES.includes(type)) return { error: 'Please choose a valid document type.' };
  if (\!(file instanceof File) || file.size === 0) return { error: 'Please choose a file to upload.' };
  if (scope === 'member' && \!memberId) return { error: 'Please choose which member this document is for.' };

  const keyInfo = describeServiceKey();
  if (\!keyInfo.ok) return { error: keyInfo.message };

  const admin = createAdminClient();

  if (scope === 'member') {
    const { data: m } = await admin.from('profiles').select('id').eq('id', memberId).maybeSingle();
    if (\!m) return { error: 'That member could not be found. Please pick another.' };
  }

  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
  const folder = scope === 'member' ? memberId : 'shared';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await admin.storage
    .from('documents')
    .upload(path, bytes, { upsert: true, contentType: file.type || 'application/octet-stream' });
  if (upErr) return { error: `Could not upload the file: ${upErr.message}` };

  const { error: insErr } = await admin.from('documents').insert({
    title,
    type,
    member_id: scope === 'member' ? memberId : null,
    file_path: path,
    uploaded_by: gate.userId,
  });
  if (insErr) {
    try {
      await admin.storage.from('documents').remove([path]);
    } catch {
      /* best-effort cleanup of the orphaned upload */
    }
    return { error: `Could not save the document: ${insErr.message}` };
  }

  revalidatePath('/staff/documents');
  revalidatePath('/documents');
  return { ok: true };
}

export async function deleteDocument(formData: FormData) {
  const gate = await requireStaff();
  if ('error' in gate) return;
  const id = String(formData.get('id') || '');
  if (\!id) return;

  const admin = createAdminClient();
  const { data: row } = await admin.from('documents').select('file_path').eq('id', id).maybeSingle();
  await admin.from('documents').delete().eq('id', id);
  if (row?.file_path) {
    try {
      await admin.storage.from('documents').remove([row.file_path]);
    } catch {
      /* ignore storage cleanup errors */
    }
  }
  revalidatePath('/staff/documents');
  revalidatePath('/documents');
}
