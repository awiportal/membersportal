'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isStaff, isChairlady, isAdmin } from '@/lib/roles';

// Exit-settlement workflow (#162). Segregated duties mirror the withdrawal flow:
//   initiate (create draft)      -> any staff (Secretary+),
//   approve  (draft -> approved) -> Chairlady only,
//   pay      (approved -> paid)  -> Admin or Chairlady (also archives the member).
// This is a RECORD only; it does not move fund money (the withdrawals / fund-data
// flow remains authoritative for member_finances balances).

function n(v: any): number {
  const x = Number(v);
  return isNaN(x) ? 0 : x;
}

async function requireCap(need: 'initiate' | 'approve' | 'pay') {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = me?.role as string | undefined;
  const ok = need === 'initiate' ? isStaff(role) : need === 'approve' ? isChairlady(role) : isAdmin(role);
  if (!ok) throw new Error('Not authorized');
  return { supabase, uid: user.id, role };
}

async function logAudit(supabase: any, uid: string, memberId: string, action: string, meta: any) {
  try {
    await supabase.from('audit_log').insert({ actor_id: uid, member_id: memberId, action, meta });
  } catch {
    /* best-effort */
  }
}

async function loadSettlement(supabase: ReturnType<typeof createClient>, id: string) {
  const { data } = await supabase
    .from('exit_settlements')
    .select('id, member_id, status, net_payable')
    .eq('id', id)
    .single();
  return data as { id: string; member_id: string; status: string; net_payable: number } | null;
}

function revalidate(memberId: string) {
  revalidatePath(`/staff/members/${memberId}`);
  revalidatePath('/staff/exits');
}

// Create a draft settlement (any staff). Amounts are a snapshot the office can
// adjust before approval. Guarded so a member never has two open settlements.
export async function initiateExit(formData: FormData) {
  const memberId = String(formData.get('member_id') || '');
  if (!memberId) return;
  const { supabase, uid } = await requireCap('initiate');

  const gross = n(formData.get('gross_entitlement'));
  const alreadyPaid = n(formData.get('amount_already_paid'));
  const deductions = n(formData.get('deductions'));
  const net = Math.round((gross - alreadyPaid - deductions) * 100) / 100;
  const reason = String(formData.get('reason') || '').trim() || null;
  const method = String(formData.get('method') || '').trim() || null;
  const notes = String(formData.get('notes') || '').trim() || null;

  const { data: existing } = await supabase
    .from('exit_settlements')
    .select('id')
    .eq('member_id', memberId)
    .in('status', ['draft', 'approved'])
    .maybeSingle();
  if (existing) {
    revalidate(memberId);
    return;
  }

  const { error } = await supabase.from('exit_settlements').insert({
    member_id: memberId,
    status: 'draft',
    gross_entitlement: gross,
    amount_already_paid: alreadyPaid,
    deductions,
    net_payable: net,
    reason,
    method,
    notes,
    initiated_by: uid,
  });
  if (error) {
    console.error('initiateExit failed:', error.message);
    return;
  }
  await logAudit(supabase, uid, memberId, 'exit_settlement_initiated', { gross, alreadyPaid, deductions, net });
  revalidate(memberId);
}

// Approve a draft settlement (Chairlady only).
export async function approveExit(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { supabase, uid } = await requireCap('approve');
  const s = await loadSettlement(supabase, id);
  if (!s || s.status !== 'draft') return;

  await supabase
    .from('exit_settlements')
    .update({ status: 'approved', approved_by: uid, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  await logAudit(supabase, uid, s.member_id, 'exit_settlement_approved', { settlement_id: id, net: s.net_payable });
  revalidate(s.member_id);
}

// Mark an approved settlement as paid (Admin or Chairlady). Archives the member
// (departed). Does NOT post money to member_finances — that stays with the
// withdrawals / fund-data flow to avoid double counting.
export async function markExitPaid(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { supabase, uid } = await requireCap('pay');
  const s = await loadSettlement(supabase, id);
  if (!s || s.status !== 'approved') return;

  const reference = String(formData.get('reference') || '').trim() || null;

  await supabase
    .from('exit_settlements')
    .update({ status: 'paid', paid_by: uid, paid_at: new Date().toISOString(), reference, updated_at: new Date().toISOString() })
    .eq('id', id);

  // Departed member: archive their login standing.
  await supabase.from('profiles').update({ status: 'archived' }).eq('id', s.member_id);

  await logAudit(supabase, uid, s.member_id, 'exit_settlement_paid', { settlement_id: id, net: s.net_payable, reference });
  revalidate(s.member_id);
  revalidatePath('/staff');
}

// Cancel a draft or approved settlement (Admin or Chairlady).
export async function cancelExit(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { supabase, uid } = await requireCap('pay');
  const s = await loadSettlement(supabase, id);
  if (!s || (s.status !== 'draft' && s.status !== 'approved')) return;

  await supabase
    .from('exit_settlements')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id);
  await logAudit(supabase, uid, s.member_id, 'exit_settlement_cancelled', { settlement_id: id });
  revalidate(s.member_id);
}
