'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStaff, canDisburseFunds } from '@/lib/roles';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function n(v: any): number {
  const x = Number(v);
  return isNaN(x) ? 0 : x;
}

// Default balance rule (confirmed): TOTAL = opening + 2026 contributions + total interest - withdrawals.
function recompute(row: any) {
  const total = n(row.opening_balance_2025) + n(row.contributions_2026) + n(row.total_interest_2026) - n(row.withdrawal);
  return { current_balance: total, net_balance: total };
}

async function staffClient() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');
  return supabase;
}

// Money-out actions (record withdrawal, mark/settle exit) require Admin tier.
async function disburseClient() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!canDisburseFunds(me?.role)) redirect('/staff');
  return supabase;
}

function normMemberNo(raw: string): string | null {
  const t = (raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!t) return null;
  const m = t.match(/^AWI-?0*(\d{1,3})$/) || t.match(/^0*(\d{1,3})$/);
  if (m) return 'AWI-' + m[1].padStart(3, '0');
  return t;
}

async function loadRow(supabase: any, memberNo: string) {
  const { data } = await supabase.from('member_finances').select('*').eq('member_no', memberNo).maybeSingle();
  return data;
}

// Post one member's contribution for one month; recompute the 2026 total + balance.
export async function postContribution(formData: FormData) {
  const supabase = await staffClient();
  const memberNo = normMemberNo(String(formData.get('member_no') || ''));
  const month = String(formData.get('month') || '').toLowerCase();
  const amount = n(formData.get('amount'));
  if (!memberNo || !MONTHS.includes(month)) redirect('/staff/fund-data?err=1');
  const row = await loadRow(supabase, memberNo!);
  if (!row) redirect('/staff/fund-data?err=1');
  const sched = row.sched_2026 && typeof row.sched_2026 === 'object' ? { ...row.sched_2026 } : {};
  sched[month] = amount;
  const posted = row.sched_2026_posted && typeof row.sched_2026_posted === 'object' ? { ...row.sched_2026_posted } : {};
  posted[month] = new Date().toISOString();
  const contributions2026 = MONTHS.reduce((s, m) => s + n(sched[m]), 0);
  const rc = recompute({ ...row, contributions_2026: contributions2026 });
  await supabase
    .from('member_finances')
    .update({
      sched_2026: sched,
      sched_2026_posted: posted,
      contributions_2026: contributions2026,
      current_balance: rc.current_balance,
      net_balance: rc.net_balance,
      last_posted_at: new Date().toISOString(),
    })
    .eq('member_no', memberNo);
  revalidatePath('/staff/fund-data');
  revalidatePath('/staff/statements');
  redirect('/staff/fund-data?ok=posted');
}

// Record a withdrawal (adds to any prior withdrawal); reflects across balances.
export async function recordWithdrawal(formData: FormData) {
  const supabase = await disburseClient();
  const memberNo = normMemberNo(String(formData.get('member_no') || ''));
  const amount = n(formData.get('amount'));
  const note = String(formData.get('note') || '').trim();
  if (!memberNo || amount <= 0) redirect('/staff/fund-data?err=1');
  const row = await loadRow(supabase, memberNo!);
  if (!row) redirect('/staff/fund-data?err=1');
  const withdrawal = n(row.withdrawal) + amount;
  const rc = recompute({ ...row, withdrawal });
  const stamp = new Date().toLocaleDateString('en-GB');
  const line = stamp + ': withdrawal ' + Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (note ? ' - ' + note : '');
  const notes = row.notes ? row.notes + ' | ' + line : line;
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
    .eq('member_no', memberNo);
  revalidatePath('/staff/fund-data');
  revalidatePath('/staff/statements');
  redirect('/staff/fund-data?ok=withdrawal');
}

// Mark a member exiting and record the refund amount requested (pending, not yet paid).
export async function markExit(formData: FormData) {
  const supabase = await disburseClient();
  const memberNo = normMemberNo(String(formData.get('member_no') || ''));
  const refund = n(formData.get('refund'));
  if (!memberNo) redirect('/staff/fund-data?err=1');
  await supabase
    .from('member_finances')
    .update({
      status: 'exiting',
      refund_status: 'in_process',
      refund_on_exit: refund,
      last_posted_at: new Date().toISOString(),
    })
    .eq('member_no', memberNo);
  revalidatePath('/staff/fund-data');
  revalidatePath('/staff/statements');
  redirect('/staff/fund-data?ok=exit');
}

// Settle an exit: post the pending refund as a withdrawal; net balance = TOTAL - amount paid.
export async function settleExit(formData: FormData) {
  const supabase = await disburseClient();
  const memberNo = normMemberNo(String(formData.get('member_no') || ''));
  if (!memberNo) redirect('/staff/fund-data?err=1');
  const row = await loadRow(supabase, memberNo!);
  if (!row) redirect('/staff/fund-data?err=1');
  const refund = n(row.refund_on_exit);
  const withdrawal = n(row.withdrawal) + refund;
  const rc = recompute({ ...row, withdrawal });
  await supabase
    .from('member_finances')
    .update({
      status: 'exited',
      withdrawal,
      refund_status: 'paid',
      current_balance: rc.current_balance,
      net_balance: rc.net_balance,
      withdrawal_at: new Date().toISOString(),
      last_posted_at: new Date().toISOString(),
    })
    .eq('member_no', memberNo);
  revalidatePath('/staff/fund-data');
  revalidatePath('/staff/statements');
  redirect('/staff/fund-data?ok=settled');
}

function cells(line: string): string[] {
  return line.split(/[\t,;]/).map((s) => s.trim());
}

// Bulk import the 2026 monthly schedule: member_no, Jan..Dec (up to 12 numbers).
export async function importSchedule(formData: FormData) {
  const supabase = await staffClient();
  const raw = String(formData.get('data') || '');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let updated = 0;
  let failed = 0;
  for (const line of lines) {
    const c = cells(line);
    if (/^member[_ ]?no$/i.test(c[0] || '') || /^#$/.test(c[0] || '')) continue;
    const memberNo = normMemberNo(c[0] || '');
    if (!memberNo) {
      failed++;
      continue;
    }
    const row = await loadRow(supabase, memberNo);
    if (!row) {
      failed++;
      continue;
    }
    const sched: Record<string, number> = {};
    const posted = row.sched_2026_posted && typeof row.sched_2026_posted === 'object' ? { ...row.sched_2026_posted } : {};
    const nowIso = new Date().toISOString();
    for (let i = 0; i < 12; i++) {
      const val = c[i + 1];
      const amt = val ? n(val.replace(/[^0-9.\-]/g, '')) : 0;
      sched[MONTHS[i]] = amt;
      if (amt) posted[MONTHS[i]] = nowIso;
    }
    const contributions2026 = MONTHS.reduce((s, m) => s + n(sched[m]), 0);
    const rc = recompute({ ...row, contributions_2026: contributions2026 });
    const { error } = await supabase
      .from('member_finances')
      .update({
        sched_2026: sched,
        sched_2026_posted: posted,
        contributions_2026: contributions2026,
        current_balance: rc.current_balance,
        net_balance: rc.net_balance,
        last_posted_at: nowIso,
      })
      .eq('member_no', memberNo);
    if (error) failed++;
    else updated++;
  }
  revalidatePath('/staff/fund-data');
  revalidatePath('/staff/statements');
  redirect('/staff/fund-data?updated=' + updated + '&failed=' + failed);
}

// Bulk import the Compiled statement: member_no, contributions(lifetime), interest2018-2023,
// britam, jubMMF, jubFIF, jubFIF(apr-jul), totalInterest, withdrawal. Recomputes balance.
export async function importCompiled(formData: FormData) {
  const supabase = await staffClient();
  const raw = String(formData.get('data') || '');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let updated = 0;
  let failed = 0;
  const nz = (v: string | undefined) => (v == null || v === '' ? null : n(String(v).replace(/[^0-9.\-]/g, '')));
  for (const line of lines) {
    const c = cells(line);
    if (/^member[_ ]?no$/i.test(c[0] || '') || /^#$/.test(c[0] || '')) continue;
    const memberNo = normMemberNo(c[0] || '');
    if (!memberNo) {
      failed++;
      continue;
    }
    const row = await loadRow(supabase, memberNo);
    if (!row) {
      failed++;
      continue;
    }
    const patch: Record<string, any> = {
      lifetime_contributions: nz(c[1]),
      interest_2018_2023: nz(c[2]),
      britam_interest_life: nz(c[3]),
      jubilee_mmf: nz(c[4]),
      jubilee_fif: nz(c[5]),
      jubilee_fif_apr_jul: nz(c[6]),
      total_interest_2026: nz(c[7]),
      withdrawal: nz(c[8]),
      last_posted_at: new Date().toISOString(),
    };
    const merged = { ...row, ...patch };
    const rc = recompute(merged);
    patch.current_balance = rc.current_balance;
    patch.net_balance = rc.net_balance;
    const { error } = await supabase.from('member_finances').update(patch).eq('member_no', memberNo);
    if (error) failed++;
    else updated++;
  }
  revalidatePath('/staff/fund-data');
  revalidatePath('/staff/statements');
  redirect('/staff/fund-data?updated=' + updated + '&failed=' + failed);
}
