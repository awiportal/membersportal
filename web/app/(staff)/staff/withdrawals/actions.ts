'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isStaff, isAdmin, isChairlady } from '@/lib/roles';
import { sendMemberEmail } from '@/lib/email';

function n(v: any): number {
  const x = Number(v);
  return isNaN(x) ? 0 : x;
}

// Same balance rule as Fund Data: TOTAL = opening + 2026 contributions + interest − withdrawals.
function recompute(row: any) {
  const total =
    n(row.opening_balance_2025) + n(row.contributions_2026) + n(row.total_interest_2026) - n(row.withdrawal);
  return { current_balance: total, net_balance: total };
}

// Resolve the signed-in staff member and their role. `need` decides the minimum
// capability for the action (segregated duties):
//   review  -> any staff (Secretary+)
//   decide  -> Chairlady only
//   pay     -> Admin or Chairlady
async function requireCap(need: 'review' | 'decide' | 'pay') {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = me?.role as string | undefined;
  const ok =
    need === 'review' ? isStaff(role) : need === 'decide' ? isChairlady(role) : isAdmin(role);
  if (!ok) throw new Error('Not authorized');
  return { supabase, uid: user.id, role };
}

const kes = (v: any) => `KES ${Math.round(n(v)).toLocaleString('en-KE')}`;

// Legal transitions only — guards against double-processing and stale cards.
const VALID_FROM: Record<'under_review' | 'approved' | 'rejected' | 'paid', string[]> = {
  under_review: ['submitted'],
  approved: ['under_review'],
  rejected: ['submitted', 'under_review'],
  paid: ['approved'],
};

async function loadRequest(supabase: ReturnType<typeof createClient>, id: string) {
  const { data } = await supabase
    .from('withdrawal_requests')
    .select('id, member_id, amount, method, status')
    .eq('id', id)
    .single();
  return data as { id: string; member_id: string; amount: number; method: string; status: string } | null;
}

async function notify(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  actorId: string,
  action: string,
  title: string,
  body: string,
  meta: Record<string, any>,
  email: boolean,
) {
  await supabase.from('notifications').insert({ member_id: memberId, type: 'withdrawal', title, body });
  await supabase.from('audit_log').insert({ actor_id: actorId, member_id: memberId, action, meta });
  if (email) {
    const { data: prof } = await supabase.from('profiles').select('email, full_name').eq('id', memberId).single();
    await sendMemberEmail({
      to: prof?.email,
      subject: title,
      heading: title,
      bodyHtml: `<p style="margin:0 0 12px;">Hi ${prof?.full_name || 'there'},</p><p style="margin:0;">${body}</p>`,
    });
  }
}

// ── Review: Secretary+ moves a submitted request into review ────────────────
export async function reviewWithdrawal(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { supabase, uid } = await requireCap('review');
  const req = await loadRequest(supabase, id);
  if (!req || !VALID_FROM.under_review.includes(req.status)) return;

  await supabase
    .from('withdrawal_requests')
    .update({ status: 'under_review', reviewed_by: uid, reviewed_at: new Date().toISOString() })
    .eq('id', id);

  await notify(
    supabase,
    req.member_id,
    uid,
    'withdrawal_under_review',
    'Withdrawal under review',
    `Your withdrawal request for ${kes(req.amount)} is now being reviewed by the AWIVEST office.`,
    { request_id: id, amount: req.amount },
    false,
  );
  revalidatePath('/staff/withdrawals');
}

// ── Approve: Chairlady only ─────────────────────────────────────────────────
export async function approveWithdrawal(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { supabase, uid } = await requireCap('decide');
  const req = await loadRequest(supabase, id);
  if (!req || !VALID_FROM.approved.includes(req.status)) return;

  await supabase
    .from('withdrawal_requests')
    .update({ status: 'approved', decided_by: uid, decided_at: new Date().toISOString(), decision_note: null })
    .eq('id', id);

  await notify(
    supabase,
    req.member_id,
    uid,
    'withdrawal_approved',
    'Withdrawal approved',
    `Your withdrawal request for ${kes(req.amount)} has been approved. You'll be notified again once the funds are disbursed.`,
    { request_id: id, amount: req.amount },
    true,
  );
  revalidatePath('/staff/withdrawals');
}

// ── Reject: Chairlady only ──────────────────────────────────────────────────
export async function rejectWithdrawal(formData: FormData) {
  const id = String(formData.get('id') || '');
  const note = String(formData.get('note') || '').trim();
  if (!id) return;
  const { supabase, uid } = await requireCap('decide');
  const req = await loadRequest(supabase, id);
  if (!req || !VALID_FROM.rejected.includes(req.status)) return;

  await supabase
    .from('withdrawal_requests')
    .update({
      status: 'rejected',
      decided_by: uid,
      decided_at: new Date().toISOString(),
      decision_note: note || null,
    })
    .eq('id', id);

  await notify(
    supabase,
    req.member_id,
    uid,
    'withdrawal_rejected',
    'Withdrawal not approved',
    `Your withdrawal request for ${kes(req.amount)} was not approved this time.${note ? ` Note from the office: ${note}` : ' Please contact the AWIVEST office if you have questions.'}`,
    { request_id: id, amount: req.amount },
    true,
  );
  revalidatePath('/staff/withdrawals');
}

// ── Mark paid: Admin or Chairlady. Auto-posts to the member's fund record and
// the withdrawals ledger so statements reconcile automatically. ─────────────
export async function markWithdrawalPaid(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { supabase, uid } = await requireCap('pay');
  const req = await loadRequest(supabase, id);
  if (!req || !VALID_FROM.paid.includes(req.status)) return;

  const amount = n(req.amount);

  // 1) Post to the fund record (authoritative for statements).
  const { data: fin } = await supabase
    .from('member_finances')
    .select('*')
    .eq('member_id', req.member_id)
    .maybeSingle();
  if (fin) {
    const withdrawal = n(fin.withdrawal) + amount;
    const rc = recompute({ ...fin, withdrawal });
    const stamp = new Date().toLocaleDateString('en-GB');
    const line = `${stamp}: withdrawal ${Math.round(amount).toLocaleString('en-KE')} - request payout`;
    const notes = fin.notes ? `${fin.notes} | ${line}` : line;
    await supabase
      .from('member_finances')
      .update({
        withdrawal,
        current_balance: rc.current_balance,
        net_balance: rc.net_balance,
        withdrawal_at: new Date().toISOString(),
        notes,
        last_posted_at: new Date().toISOString(),
      })
      .eq('member_id', req.member_id);
  }

  // 2) Append to the withdrawals ledger (best-effort; balance above is the source of truth).
  await supabase.from('withdrawals').insert({
    member_id: req.member_id,
    occurred_at: new Date().toISOString(),
    amount,
    method: req.method,
    reference: `WR-${String(id).slice(0, 8)}`,
  });

  // 3) Close out the request.
  await supabase
    .from('withdrawal_requests')
    .update({ status: 'paid', paid_by: uid, paid_at: new Date().toISOString() })
    .eq('id', id);

  await notify(
    supabase,
    req.member_id,
    uid,
    'withdrawal_paid',
    'Withdrawal funds sent',
    `Your withdrawal of ${kes(amount)} has been paid out and posted to your account. Thank you.`,
    { request_id: id, amount },
    true,
  );

  revalidatePath('/staff/withdrawals');
  revalidatePath('/staff/fund-data');
  revalidatePath('/staff/statements');
  revalidatePath('/withdrawals');
}
