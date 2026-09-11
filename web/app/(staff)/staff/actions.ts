'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isStaff, canApproveMembers, canDisburseFunds } from '@/lib/roles';
import { sendMemberEmail } from '@/lib/email';
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

// Elevated guard: run only when the caller's role satisfies `check`
// (e.g. canApproveMembers / canDisburseFunds). Admin-tier per the roles matrix.
async function requireCap(check: (r?: string | null) => boolean) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!check(me?.role)) throw new Error('Not authorized');
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
  const { supabase } = await requireCap(canApproveMembers);

  const { data: p } = await supabase.from('profiles').select('joined_at, email, full_name').eq('id', id).single();
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

  await sendMemberEmail({
    to: p?.email,
    subject: 'Your AWIVEST membership is approved',
    heading: 'Membership approved',
    bodyHtml: `<p style="margin:0 0 12px;">Hi ${p?.full_name || 'there'},</p>
<p style="margin:0 0 12px;">Welcome to AWIVEST. Your membership has been approved and your account is now active &mdash; your full investor portal is unlocked.</p>
<p style="margin:0;">Sign in any time to view your statement, contributions and welfare.</p>`,
  });

  refresh(id);
}

// Return a pack for changes (Secretary/Admin/Chairlady).
export async function rejectMember(formData: FormData) {
  const id = String(formData.get('id') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!id) return;
  const { supabase } = await requireCap(canApproveMembers);

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
  const { supabase } = await requireCap(canApproveMembers);
  await supabase.from('profiles').update({ status }).eq('id', id);
  refresh(id);
}

// Confirm / fix which AWIVEST fund record (member_finances row, keyed by AWI
// register no.) this login owns. Members self-link by National ID / Passport at
// onboarding; this is the office confirm-match + override. Staff-only — the
// actual write is done by the is_staff()-gated SECURITY DEFINER RPC.
export async function linkFundRecord(formData: FormData) {
  const id = String(formData.get('id') || '');
  const memberNo = String(formData.get('member_no') || '').trim();
  if (!id || !memberNo) return;
  const { supabase } = await requireStaff();
  const { error } = await supabase.rpc('staff_link_membership', {
    p_member_no: memberNo,
    p_member_id: id,
  });
  if (error) console.error('linkFundRecord failed:', error.message);
  refresh(id);
}

export async function unlinkFundRecord(formData: FormData) {
  const id = String(formData.get('id') || '');
  const memberNo = String(formData.get('member_no') || '').trim();
  if (!id || !memberNo) return;
  const { supabase } = await requireStaff();
  const { error } = await supabase.rpc('staff_unlink_membership', { p_member_no: memberNo });
  if (error) console.error('unlinkFundRecord failed:', error.message);
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

// Record a member withdrawal against their linked AWIVEST fund position. Reduces
// net_balance + current_balance (portfolio value) and appears on the statement,
// replacing the old hand-typed "absorbed into opening" note. Staff-only; the
// atomic write is the is_staff()-gated SECURITY DEFINER RPC staff_record_withdrawal.
export async function recordWithdrawal(formData: FormData) {
  const id = String(formData.get('id') || '');
  const memberNo = String(formData.get('member_no') || '').trim();
  const amount = Number(String(formData.get('amount') || '').replace(/[^0-9.]/g, ''));
  const method = String(formData.get('method') || '').trim() || null;
  const reference = String(formData.get('reference') || '').trim() || null;
  const note = String(formData.get('note') || '').trim() || null;
  if (!memberNo || !amount || amount <= 0) return;
  const { supabase } = await requireCap(canDisburseFunds);

  const { error } = await supabase.rpc('staff_record_withdrawal', {
    p_member_no: memberNo,
    p_amount: amount,
    p_method: method,
    p_reference: reference,
    p_note: note,
  });
  if (error) {
    console.error('recordWithdrawal failed:', error.message);
    return;
  }

  if (id) {
    const { data: prof } = await supabase.from('profiles').select('email, full_name').eq('id', id).single();
    await supabase.from('notifications').insert({
      member_id: id,
      type: 'withdrawal',
      title: 'Withdrawal processed',
      body: `A withdrawal of KES ${amount.toLocaleString()} has been recorded on your AWIVEST account${reference ? ` (ref ${reference})` : ''}. Your updated balance is reflected in your statement.`,
    });
    await sendMemberEmail({
      to: prof?.email,
      subject: 'AWIVEST withdrawal processed',
      heading: 'Withdrawal processed',
      bodyHtml: `<p style="margin:0 0 12px;">Hi ${prof?.full_name || 'there'},</p>
<p style="margin:0 0 12px;">A withdrawal of <strong>KES ${amount.toLocaleString()}</strong> has been recorded on your AWIVEST account${reference ? ` (reference ${reference})` : ''}.</p>
<p style="margin:0;">Your updated portfolio value is shown on your latest statement in the portal. If you did not expect this, please contact the AWIVEST office.</p>`,
    });
  }

  refresh(id);
}
