'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isStaff } from '@/lib/roles';

const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select'];
const SUB_DECISIONS = new Set(['approved', 'rejected', 'submitted']);

async function requireStaff() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');
  return supabase;
}

// Normalise the fields JSON posted from the builder into the stored shape
// [{ label, type, required, options? }]. Blank-label rows are dropped.
function parseFields(raw: string): { label: string; type: string; required: boolean; options?: string[] }[] {
  let arr: any[] = [];
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed)) arr = parsed;
  } catch {
    arr = [];
  }
  const out: { label: string; type: string; required: boolean; options?: string[] }[] = [];
  for (const f of arr) {
    const label = String(f?.label || '').trim();
    if (!label) continue;
    const type = FIELD_TYPES.includes(String(f?.type)) ? String(f.type) : 'text';
    const required = !!f?.required;
    const field: { label: string; type: string; required: boolean; options?: string[] } = { label, type, required };
    if (type === 'select') {
      const options = Array.isArray(f?.options)
        ? f.options.map((o: any) => String(o).trim()).filter(Boolean)
        : String(f?.options || '')
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean);
      field.options = options;
    }
    out.push(field);
  }
  return out;
}

function readForm(formData: FormData) {
  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim() || null;
  const require_signature = ['1', 'true', 'on'].includes(String(formData.get('require_signature') || ''));
  const status = ['1', 'true', 'on'].includes(String(formData.get('published') || '')) ? 'active' : 'archived';
  const sort_order = Number(String(formData.get('sort_order') || '0').replace(/[^0-9-]/g, '')) || 0;
  const fields = parseFields(String(formData.get('fields') || '[]'));
  return { title, description, require_signature, status, sort_order, fields };
}

export async function createForm(formData: FormData) {
  const supabase = await requireStaff();
  const payload = readForm(formData);
  if (!payload.title) redirect('/staff/forms?err=title');
  const { error } = await supabase.from('forms').insert(payload);
  if (error) redirect('/staff/forms?err=save');
  revalidatePath('/staff/forms');
  revalidatePath('/forms');
  redirect('/staff/forms?ok=created');
}

export async function updateForm(formData: FormData) {
  const supabase = await requireStaff();
  const id = String(formData.get('id') || '');
  if (!id) redirect('/staff/forms');
  const payload = readForm(formData);
  if (!payload.title) redirect('/staff/forms?err=title');
  const { error } = await supabase.from('forms').update(payload).eq('id', id);
  if (error) redirect('/staff/forms?err=save');
  revalidatePath('/staff/forms');
  revalidatePath('/forms');
  redirect('/staff/forms?ok=updated');
}

export async function setFormStatus(formData: FormData) {
  const supabase = await requireStaff();
  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '') === 'active' ? 'active' : 'archived';
  if (!id) redirect('/staff/forms');
  await supabase.from('forms').update({ status }).eq('id', id);
  revalidatePath('/staff/forms');
  revalidatePath('/forms');
  redirect('/staff/forms?ok=' + (status === 'active' ? 'published' : 'unpublished'));
}

export async function deleteForm(formData: FormData) {
  const supabase = await requireStaff();
  const id = String(formData.get('id') || '');
  if (!id) redirect('/staff/forms');
  // form_submissions is ON DELETE CASCADE, so its submissions go with the form.
  await supabase.from('forms').delete().eq('id', id);
  revalidatePath('/staff/forms');
  revalidatePath('/forms');
  redirect('/staff/forms?ok=deleted');
}

export async function reviewSubmission(formData: FormData) {
  const supabase = await requireStaff();
  const id = String(formData.get('id') || '');
  const formId = String(formData.get('form_id') || '');
  const decision = String(formData.get('decision') || '');
  const comment = String(formData.get('comment') || '').trim() || null;
  if (!id || !SUB_DECISIONS.has(decision)) redirect(`/staff/forms/${formId}/submissions`);
  await supabase
    .from('form_submissions')
    .update({ status: decision, comment, updated_at: new Date().toISOString() })
    .eq('id', id);
  revalidatePath(`/staff/forms/${formId}/submissions`);
  revalidatePath('/forms');
  redirect(`/staff/forms/${formId}/submissions?ok=1`);
}

// Short-lived signed URL for a submission's signature (private 'signatures' bucket).
// Staff-gated here; the storage RLS also limits reads to owners and staff.
export async function getSignatureUrl(path: string): Promise<{ url?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired.' };
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) return { error: 'Not authorized.' };
  if (!path) return { error: 'No signature on file.' };
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from('signatures').createSignedUrl(path, 120);
  if (error || !data?.signedUrl) return { error: 'Could not load the signature.' };
  return { url: data.signedUrl };
}
