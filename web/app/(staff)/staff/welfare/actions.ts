'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isStaff, canDisburseFunds } from '@/lib/roles';
import { sendMemberEmail } from '@/lib/email';

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

// Paying a claim moves money, so it needs Admin tier (review/return stay staff).
async function requireDisburse() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!canDisburseFunds(me?.role)) throw new Error('Not authorized');
  return { supabase, uid: user.id };
}

// Only these transitions are legal. Guards against double-processing (e.g. two
// staff clicking "Mark paid", or acting on a stale card): approve/return apply
// only to a pending claim; mark-paid only to an approved one.
const VALID_FROM: Record<'approved' | 'rejected' | 'paid', string[]> = {
  approved: ['pending'],
  rejected: ['pending'],
  paid: ['approved'],
};

// Update a claim's status, notify the member, and write a best-effort audit row.
// NOTE (Phase 2): marking a claim "paid" does not yet move any money/balance —
// the balance-on-distribution rule is a deliberate, separate change.
async function decide(
  claimId: string,
  status: 'approved' | 'rejected' | 'paid',
  actorId: string,
  supabase: ReturnType<typeof createClient>,
) {
  const { data: claim } = await supabase
    .from('welfare_claims')
    .select('id, member_id, claim_type, amount, status')
    .eq('id', claimId)
    .single();
  if (!claim) return;

  // Ignore illegal or duplicate transitions instead of silently re-writing state.
  if (!VALID_FROM[status].includes(claim.status)) return;

  await supabase.from('welfare_claims').update({ status }).eq('id', claimId);

  const kes = (n: any) => `KES ${Number(n || 0).toLocaleString()}`;
  const amt = claim.amount ? ` (${kes(claim.amount)})` : '';
  const title =
    status === 'approved' ? 'Welfare claim approved'
      : status === 'paid' ? 'Welfare funds sent'
        : 'Welfare claim update';
  const body =
    status === 'approved'
      ? `Your ${claim.claim_type} welfare claim${amt} has been approved. You'll be notified again once the funds are disbursed.`
      : status === 'paid'
        ? `Your ${claim.claim_type} welfare claim${amt} has been paid out. Thank you.`
        : `Your ${claim.claim_type} welfare claim${amt} was not approved this time. Please contact the AWIVEST office if you have questions.`;

  await supabase.from('notifications').insert({
    member_id: claim.member_id,
    type: 'welfare',
    title,
    body,
  });

  // Best-effort audit trail (staff INSERT policy on audit_log).
  await supabase.from('audit_log').insert({
    actor_id: actorId,
    member_id: claim.member_id,
    action: `welfare_${status}`,
    meta: { claim_id: claim.id, claim_type: claim.claim_type, amount: claim.amount },
  });

  // Email the member on approve/pay (best-effort; in-app notification already sent).
  if (status === 'approved' || status === 'paid') {
    const { data: prof } = await supabase.from('profiles').select('email, full_name').eq('id', claim.member_id).single();
    await sendMemberEmail({
      to: prof?.email,
      subject: status === 'paid' ? 'AWIVEST welfare funds sent' : 'AWIVEST welfare claim approved',
      heading: title,
      bodyHtml: `<p style="margin:0 0 12px;">Hi ${prof?.full_name || 'there'},</p><p style="margin:0;">${body}</p>`,
    });
  }

  revalidatePath('/staff/welfare');
}

export async function approveClaim(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { supabase, uid } = await requireStaff();
  await decide(id, 'approved', uid, supabase);
}

export async function rejectClaim(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { supabase, uid } = await requireStaff();
  await decide(id, 'rejected', uid, supabase);
}

export async function markClaimPaid(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { supabase, uid } = await requireDisburse();
  await decide(id, 'paid', uid, supabase);
}
