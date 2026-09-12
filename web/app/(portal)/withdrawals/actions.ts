'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getWithdrawalsOpen } from '@/lib/settings';

const MIGRATION_HINT =
  'Withdrawals are not enabled yet. Please run the v1.5 database migration (withdrawal_requests), then try again.';

function looksMissingTable(msg?: string) {
  const m = (msg || '').toLowerCase();
  return m.includes('withdrawal_requests') || (m.includes('does not exist')) || m.includes('schema cache');
}

export type WithdrawalInput = {
  amount: number;
  reason: string;
  reason_type: 'exit' | 'other';
  method: 'bank' | 'mpesa';
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  mpesa_phone?: string | null;
  letter_path: string;
};

export async function submitWithdrawal(input: WithdrawalInput): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again.' };
  const uid = user.id;

  const amount = Math.round((Number(input?.amount) || 0) * 100) / 100;
  if (!(amount > 0)) return { error: 'Please enter an amount greater than zero.' };

  const method = input?.method === 'mpesa' ? 'mpesa' : 'bank';
  const reason = String(input?.reason || '').trim();
  if (!reason) return { error: 'Please give a brief reason for the withdrawal.' };

  // Every payout request records WHY: 'exit' (leaving the fund) or 'other'.
  const reason_type = input?.reason_type === 'exit' ? 'exit' : 'other';

  // Window enforcement (long-term fund) happens after we load the member's fund
  // record below, so members who are exiting are always allowed to request.

  const letter_path = String(input?.letter_path || '').trim();
  // Only accept a letter uploaded into the member's own folder of the bucket.
  if (!letter_path || !letter_path.startsWith(`${uid}/`)) {
    return { error: 'Please attach your signed withdrawal request letter.' };
  }

  const bank_name = method === 'bank' ? String(input?.bank_name || '').trim() : null;
  const account_name = method === 'bank' ? String(input?.account_name || '').trim() : null;
  const account_number = method === 'bank' ? String(input?.account_number || '').trim() : null;
  const mpesa_phone = method === 'mpesa' ? String(input?.mpesa_phone || '').trim() : null;
  if (method === 'bank' && (!bank_name || !account_name || !account_number)) {
    return { error: 'Please complete your bank name, account name and account number.' };
  }
  if (method === 'mpesa' && !mpesa_phone) {
    return { error: 'Please enter the M-Pesa phone number to send funds to.' };
  }

  // Load the member's fund record: it gives both the available balance and
  // whether they are leaving the fund.
  const { data: fin } = await supabase
    .from('member_finances')
    .select('net_balance, current_balance, status')
    .eq('member_id', uid)
    .maybeSingle();

  // AWIVEST is a long-term fund: while the Admin has the payout window closed,
  // only members who are exiting the fund may request. Everyone may request
  // while the window is open.
  const windowOpen = await getWithdrawalsOpen();
  const memberExiting = fin?.status === 'exiting';
  if (!windowOpen && !memberExiting) {
    return {
      error:
        'Payout requests are currently closed by the office. Your funds remain invested — you can request when the window reopens.',
    };
  }

  if (fin) {
    const available = Number(fin.net_balance ?? fin.current_balance ?? 0);
    if (amount > available) {
      return { error: `That is more than your available balance of KES ${Number(available).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.` };
    }
  }

  const { error } = await supabase.from('withdrawal_requests').insert({
    member_id: uid,
    amount,
    reason,
    reason_type,
    method,
    bank_name,
    account_name,
    account_number,
    mpesa_phone,
    letter_path,
    status: 'submitted',
  });
  if (error) {
    console.error('submitWithdrawal failed:', error.message);
    return { error: looksMissingTable(error.message) ? MIGRATION_HINT : 'We could not submit your request just now. Please try again in a moment.' };
  }

  // Best-effort audit trail (member acting on her own row).
  await supabase.from('audit_log').insert({
    actor_id: uid,
    member_id: uid,
    action: 'withdrawal_submitted',
    meta: { amount, method },
  });

  revalidatePath('/withdrawals');
  return { ok: true };
}

export async function cancelWithdrawal(id: string): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Please sign in again.' };
  if (!id) return { error: 'That request could not be found.' };

  const { data: row } = await supabase
    .from('withdrawal_requests')
    .select('id, member_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!row || row.member_id !== user.id) return { error: 'That request could not be found.' };
  if (row.status !== 'submitted' && row.status !== 'under_review') {
    return { error: 'This request can no longer be cancelled.' };
  }

  const { error } = await supabase
    .from('withdrawal_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('member_id', user.id);
  if (error) {
    console.error('cancelWithdrawal failed:', error.message);
    return { error: 'We could not cancel that request just now. Please try again.' };
  }

  await supabase.from('audit_log').insert({
    actor_id: user.id,
    member_id: user.id,
    action: 'withdrawal_cancelled',
    meta: { request_id: id },
  });

  revalidatePath('/withdrawals');
  return { ok: true };
}
