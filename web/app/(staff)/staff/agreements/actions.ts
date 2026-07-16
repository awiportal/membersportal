'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, describeServiceKey } from '@/lib/supabase/admin';
import { isStaff } from '@/lib/roles';

/**
 * Confirm the caller is a signed-in staff member, then hand back an admin
 * (service-role) client for the privileged write. The admin client bypasses
 * row-level security — the staff check here is the security boundary.
 */
async function requireStaffAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) throw new Error('Not authorized');
  return { admin: createAdminClient(), userId: user.id };
}

export async function addAgreement(
  formData: FormData
): Promise<{ ok?: true; error?: string }> {
  // 1) Confirm signed-in staff. Precise messages so the real state is visible.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '[v3] You appear to be signed out. Please sign in again and retry.' };
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = me?.role ? String(me.role) : 'none';
  if (!isStaff(me?.role)) {
    return {
      error: `[v3] Your account role is "${role}", which is not a staff role — the system will not let you add agreements. Set this account to a staff role (e.g. superadmin) first.`,
    };
  }

  // 2) Validate input.
  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim() || null;
  const required = String(formData.get('required') || '') === '1';
  const file = formData.get('file');
  if (!title) return { error: '[v3] Please give the agreement a title.' };
  if (!(file instanceof File) || file.size === 0) return { error: '[v3] Please choose a file to upload.' };

  // 3) Confirm the server actually has a real service-role key. A wrong key
  //    (e.g. the anon key) is the usual cause of a lingering RLS error here.
  const keyInfo = describeServiceKey();
  if (!keyInfo.ok) return { error: `[v3] ${keyInfo.message}` };

  // 4) Privileged write via the admin client (bypasses RLS).
  const admin = createAdminClient();
  try {
    await admin.storage.createBucket('agreements', { public: true });
  } catch {
    /* bucket already exists — ignore */
  }

  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await admin.storage
    .from('agreements')
    .upload(path, bytes, { upsert: true, contentType: file.type || 'application/octet-stream' });
  if (upErr) return { error: `[v3] Could not upload the file (key role: ${keyInfo.role}): ${upErr.message}` };

  const { error: insErr } = await admin.from('agreement_documents').insert({
    title,
    description,
    file_path: path,
    file_name: file.name,
    mime_type: file.type || null,
    required,
    created_by: user.id,
  });
  if (insErr) return { error: `[v3] Could not save the agreement (key role: ${keyInfo.role}): ${insErr.message}` };

  revalidatePath('/staff/agreements');
  revalidatePath('/onboarding');
  return { ok: true };
}

export async function setAgreementActive(formData: FormData) {
  const id = String(formData.get('id') || '');
  const active = String(formData.get('active') || '') === 'true';
  if (!id) return;
  const { admin } = await requireStaffAdmin();
  await admin.from('agreement_documents').update({ active }).eq('id', id);
  revalidatePath('/staff/agreements');
  revalidatePath('/onboarding');
}

export async function setAgreementRequired(formData: FormData) {
  const id = String(formData.get('id') || '');
  const required = String(formData.get('required') || '') === 'true';
  if (!id) return;
  const { admin } = await requireStaffAdmin();
  await admin.from('agreement_documents').update({ required }).eq('id', id);
  revalidatePath('/staff/agreements');
  revalidatePath('/onboarding');
}

export async function deleteAgreement(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { admin } = await requireStaffAdmin();
  const { data: row } = await admin
    .from('agreement_documents')
    .select('file_path')
    .eq('id', id)
    .single();
  if (row?.file_path) {
    await admin.storage.from('agreements').remove([row.file_path]);
  }
  await admin.from('agreement_documents').delete().eq('id', id);
  revalidatePath('/staff/agreements');
  revalidatePath('/onboarding');
}
