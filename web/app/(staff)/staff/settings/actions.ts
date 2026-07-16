'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isStaff } from '@/lib/roles';
import { pandadocConfigured, ping, createFromTemplate, sendSilently, createSigningLink } from '@/lib/pandadoc';

async function requireStaff() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: me } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single();
  if (!isStaff(me?.role)) throw new Error('Not authorized');
  return { user, me };
}

async function readSettings() {
  const admin = createAdminClient();
  const { data } = await admin.from('app_settings').select('key,value');
  return Object.fromEntries(((data ?? []) as any[]).map((r) => [r.key, r.value])) as Record<string, string>;
}

export async function saveEsignSettings(formData: FormData): Promise<{ ok?: true; error?: string }> {
  try {
    await requireStaff();
  } catch {
    return { error: 'Only staff can change settings.' };
  }
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const rows = [
    { key: 'pandadoc_onboarding_template_id', value: String(formData.get('onboarding_template_id') || '').trim(), updated_at: now },
    { key: 'pandadoc_oneoff_template_id', value: String(formData.get('oneoff_template_id') || '').trim(), updated_at: now },
    { key: 'pandadoc_signer_role', value: String(formData.get('signer_role') || '').trim() || 'Investor', updated_at: now },
  ];
  const { error } = await admin.from('app_settings').upsert(rows, { onConflict: 'key' });
  if (error) return { error: `Could not save: ${error.message}` };
  revalidatePath('/staff/settings');
  revalidatePath('/onboarding');
  return { ok: true };
}

export async function testPandadoc(): Promise<{ ok?: true; error?: string }> {
  try {
    await requireStaff();
  } catch {
    return { error: 'Only staff can run this.' };
  }
  if (!pandadocConfigured()) {
    return { error: 'PANDADOC_API_KEY is not set on the server. Add it in Vercel > Settings > Environment Variables and redeploy.' };
  }
  try {
    await ping();
    return { ok: true };
  } catch (e: any) {
    return { error: e?.message || 'PandaDoc test failed.' };
  }
}

export async function previewOnboardingDoc(): Promise<{ ok?: true; url?: string; error?: string }> {
  let ctx;
  try {
    ctx = await requireStaff();
  } catch {
    return { error: 'Only staff can run this.' };
  }
  if (!pandadocConfigured()) {
    return { error: 'PANDADOC_API_KEY is not set on the server.' };
  }
  const settings = await readSettings();
  const templateId = settings['pandadoc_onboarding_template_id'];
  const role = settings['pandadoc_signer_role'] || 'Investor';
  if (!templateId) return { error: 'Set the Onboarding Packet Template ID and Save first.' };
  const email = ctx.user.email;
  if (!email) return { error: 'Your account has no email address to send the test to.' };
  try {
    const [first, ...rest] = String(ctx.me?.full_name || 'AWIVEST Staff').trim().split(' ');
    const docId = await createFromTemplate({
      templateId,
      roleName: role,
      email,
      firstName: first,
      lastName: rest.join(' ') || undefined,
      name: 'AWIVEST Onboarding Packet (test)',
    });
    await sendSilently(docId);
    const url = await createSigningLink(docId, email);
    return { ok: true, url };
  } catch (e: any) {
    return { error: e?.message || 'Could not create the test document.' };
  }
}
