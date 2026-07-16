'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';
import { pandadocConfigured, createFromTemplate, sendForSigning, listTemplates } from '@/lib/pandadoc';

async function requireStaff() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) throw new Error('Not authorized');
  return { supabase, uid: user.id };
}

function refresh(id: string) {
  revalidatePath('/staff');
  revalidatePath(`/staff/members/${id}`);
}

// Approve + activate a member (Secretary/Admin/Chairlady).
export async function approveMember(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { supabase } = await requireStaff();

  const { data: p } = await supabase.from('profiles').select('joined_at').eq('id', id).single();
  await supabase
    .from('profiles')
    .update({
      status: 'active',
      kyc_status: 'approved',
      joined_at: p?.joined_at ?? new Date().toISOString(),
    })
    .eq('id', id);

  await supabase.from('kyc_documents').update({ status: 'approved' }).eq('member_id', id);
  await supabase.from('notifications').insert({
    member_id: id,
    type: 'approval',
    title: 'Membership approved',
    body: 'Welcome to AWIVEST. Your account is now active and your full portal is unlocked.',
  });

  refresh(id);
}

// Return a pack for changes (Secretary/Admin/Chairlady).
export async function rejectMember(formData: FormData) {
  const id = String(formData.get('id') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!id) return;
  const { supabase } = await requireStaff();

  await supabase
    .from('profiles')
    .update({ kyc_status: 'rejected', onboarding_step: 'review' })
    .eq('id', id);

  await supabase.from('notifications').insert({
    member_id: id,
    type: 'approval',
    title: 'Membership needs attention',
    body: reason
      ? `Your membership pack was returned: ${reason}`
      : 'Your membership pack was returned for review. Please check your details and resubmit.',
  });

  refresh(id);
}

// Activate / deactivate / archive an existing member.
export async function setMemberStatus(formData: FormData) {
  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');
  if (!id || !['active', 'inactive', 'archived', 'pending'].includes(status)) return;
  const { supabase } = await requireStaff();
  await supabase.from('profiles').update({ status }).eq('id', id);
  refresh(id);
}

// List PandaDoc templates for the one-off document picker (staff-only).
export async function listEsignTemplates(): Promise<{
  templates: { id: string; name: string }[];
  defaultTemplateId?: string;
  error?: string;
}> {
  let ctx: Awaited<ReturnType<typeof requireStaff>>;
  try {
    ctx = await requireStaff();
  } catch {
    return { templates: [], error: 'Only staff can view templates.' };
  }
  if (!pandadocConfigured()) {
    return { templates: [], error: 'PandaDoc is not configured on the server.' };
  }
  try {
    const { data: rows } = await ctx.supabase.from('app_settings').select('key,value');
    const settings = Object.fromEntries(
      ((rows ?? []) as any[]).map((r) => [r.key, r.value])
    ) as Record<string, string>;
    const templates = await listTemplates();
    return {
      templates,
      defaultTemplateId: (settings['pandadoc_oneoff_template_id'] || '').trim() || undefined,
    };
  } catch (e: any) {
    return { templates: [], error: e?.message || 'Could not load templates from PandaDoc.' };
  }
}

// Send a one-off agreement (from a chosen template) to a single investor.
// PandaDoc emails the investor a secure signing link. Staff-only.
export async function sendOneOffAgreement(
  memberId: string,
  templateId: string
): Promise<{ ok?: true; templateName?: string; error?: string }> {
  let ctx: Awaited<ReturnType<typeof requireStaff>>;
  try {
    ctx = await requireStaff();
  } catch {
    return { error: 'Only staff can send agreements.' };
  }
  const { supabase } = ctx;

  if (!pandadocConfigured()) {
    return { error: 'PandaDoc is not configured on the server. Add PANDADOC_API_KEY in Vercel and redeploy.' };
  }

  const tId = (templateId || '').trim();
  if (!tId) {
    return { error: 'Please choose a document to send.' };
  }

  const { data: settingsRows } = await supabase.from('app_settings').select('key,value');
  const settings = Object.fromEntries(
    ((settingsRows ?? []) as any[]).map((r) => [r.key, r.value])
  ) as Record<string, string>;
  const role = (settings['pandadoc_signer_role'] || 'Investor').trim();

  const { data: m } = await supabase.from('profiles').select('email, full_name').eq('id', memberId).single();
  const email = (m?.email as string | undefined) || '';
  if (!email) {
    return { error: 'This investor has no email address on file.' };
  }

  try {
    const parts = String(m?.full_name || '').trim().split(' ').filter(Boolean);
    const docId = await createFromTemplate({
      templateId: tId,
      roleName: role,
      email,
      firstName: parts[0],
      lastName: parts.slice(1).join(' ') || undefined,
      name: 'AWIVEST Agreement',
    });
    await sendForSigning(
      docId,
      'AWIVEST Agreement for your signature',
      'AWIVEST has sent you an agreement to review and sign. Please open the document from this email and add your signature.'
    );

    await supabase.from('notifications').insert({
      member_id: memberId,
      type: 'agreement',
      title: 'New agreement to sign',
      body: 'AWIVEST has sent you an agreement to review and sign. Please check your email for the secure signing link.',
    });

    return { ok: true };
  } catch (e: any) {
    return { error: e?.message || 'Could not send the agreement. Please try again.' };
  }
}
