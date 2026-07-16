'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';

async function requireStaff() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) throw new Error('Not authorized');
  return { supabase };
}

export async function setAgreementActive(formData: FormData) {
  const id = String(formData.get('id') || '');
  const active = String(formData.get('active') || '') === 'true';
  if (!id) return;
  const { supabase } = await requireStaff();
  await supabase.from('agreement_documents').update({ active }).eq('id', id);
  revalidatePath('/staff/agreements');
}

export async function setAgreementRequired(formData: FormData) {
  const id = String(formData.get('id') || '');
  const required = String(formData.get('required') || '') === 'true';
  if (!id) return;
  const { supabase } = await requireStaff();
  await supabase.from('agreement_documents').update({ required }).eq('id', id);
  revalidatePath('/staff/agreements');
}

export async function deleteAgreement(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { supabase } = await requireStaff();
  const { data: row } = await supabase.from('agreement_documents').select('file_path').eq('id', id).single();
  if (row?.file_path) {
    await supabase.storage.from('agreements').remove([row.file_path]);
  }
  await supabase.from('agreement_documents').delete().eq('id', id);
  revalidatePath('/staff/agreements');
}
