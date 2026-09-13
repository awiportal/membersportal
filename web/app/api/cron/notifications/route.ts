import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMemberEmail } from '@/lib/email';
import { isAuthorizedCron } from '@/lib/cron';
import { KES } from '@/lib/format';

// #154 (code half) — automated contribution receipts + deposit-deadline
// reminders. EMAIL ONLY; SMS is explicitly out of scope (it waits on a provider
// the office has not chosen).
//
// Runs on a Vercel Cron (daily 05:00 UTC ~= 08:00 EAT; see web/vercel.json).
// Two independent jobs, each fail-soft and idempotent:
//
//   1) RECEIPTS — every confirmed contribution that has not been receipted yet
//      (contributions.receipt_sent_at IS NULL) is emailed a receipt with the
//      EXACT cent amount, then stamped so it is never sent twice. Historical /
//      seeded ledgers were backfilled as already-receipted by migration
//      20260913120000, so only contributions recorded after go-live earn one.
//
//   2) REMINDERS — ahead of the monthly deposit deadline, active members with a
//      linked login are reminded once per deadline period. There is no existing
//      deadline column in the schema, so the deadline is configurable via
//      app_settings (contribution_deadline_day / contribution_reminder_lead_days)
//      with sensible defaults, per web/lib/settings.ts conventions. Reminders are
//      gated by contribution_reminders_enabled and default OFF, so enabling the
//      monthly member-wide email is a deliberate staff action.
//
// Reads/writes go through the SERVICE-ROLE admin client (bypasses RLS) because
// the job acts across all members and reads/writes the notification ledger.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// NOTE (Vercel cron config — web/vercel.json): cron schedules run in UTC. This
// route is scheduled at 05:00 UTC (~08:00 EAT). If the project's Vercel plan
// restricts cron frequency, the schedule can be relaxed (it is already daily)
// with no code change: the handler is idempotent and safe to invoke manually
// (receipts are stamped once; reminders are deduped one-per-member-per-period).

const RECEIPT_BATCH_LIMIT = 500;

function bool(v: string | null | undefined, dflt: boolean): boolean {
  if (v == null) return dflt;
  return String(v).trim().toLowerCase() === 'true';
}
function intOr(v: string | null | undefined, dflt: number): number {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : dflt;
}
function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

type Contribution = {
  id: string;
  member_id: string | null;
  amount: number | string;
  currency: string | null;
  method: string | null;
  provider_ref: string | null;
  status: string | null;
  confirmed_at: string | null;
  created_at: string | null;
};
type ProfileRow = { id: string; full_name: string | null; email: string | null };
type FinanceRow = { member_no: string; member_id: string | null; full_name: string | null };

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'admin-client-unavailable' }, { status: 500 });
  }

  const nowIso = new Date().toISOString();

  // ---- Settings (text values; safe defaults if unset / table not migrated) ---
  const settings = new Map<string, string>();
  try {
    const { data } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', [
        'contribution_receipts_enabled',
        'contribution_reminders_enabled',
        'contribution_deadline_day',
        'contribution_reminder_lead_days',
      ]);
    for (const r of (data ?? []) as { key: string; value: string | null }[]) {
      if (r.value != null) settings.set(r.key, r.value);
    }
  } catch (e: any) {
    console.error('notifications: settings read failed (using defaults):', e?.message || e);
  }

  const receiptsEnabled = bool(settings.get('contribution_receipts_enabled'), true);
  const remindersEnabled = bool(settings.get('contribution_reminders_enabled'), false);
  const deadlineDay = Math.min(28, Math.max(1, intOr(settings.get('contribution_deadline_day'), 5)));
  const leadDays = Math.min(28, Math.max(0, intOr(settings.get('contribution_reminder_lead_days'), 3)));

  // ==========================================================================
  // JOB 1 — contribution receipts
  // ==========================================================================
  let receiptsSent = 0;
  let receiptsSkippedNoEmail = 0;
  const receiptErrors: string[] = [];
  if (receiptsEnabled) {
    try {
      const { data: rows } = await admin
        .from('contributions')
        .select('id, member_id, amount, currency, method, provider_ref, status, confirmed_at, created_at')
        .eq('status', 'confirmed')
        .is('receipt_sent_at', null)
        .gt('amount', 0)
        .order('created_at', { ascending: true })
        .limit(RECEIPT_BATCH_LIMIT);
      const contribs = (rows ?? []) as Contribution[];

      const memberIds = Array.from(new Set(contribs.map((c) => c.member_id).filter(Boolean))) as string[];
      let profById = new Map<string, ProfileRow>();
      if (memberIds.length) {
        const { data: profs } = await admin
          .from('profiles')
          .select('id, full_name, email')
          .in('id', memberIds);
        profById = new Map(((profs ?? []) as ProfileRow[]).map((p) => [p.id, p]));
      }

      for (const c of contribs) {
        const prof = c.member_id ? profById.get(c.member_id) : undefined;
        const email = (prof?.email || '').trim();
        if (!email) {
          receiptsSkippedNoEmail++;
          continue; // can't receipt without an address; leave unstamped to retry later
        }
        const when = fmtDate(new Date(c.confirmed_at || c.created_at || nowIso));
        const amount = KES(Number(c.amount) || 0);
        const ref = c.provider_ref ? String(c.provider_ref) : '';
        const method = c.method ? String(c.method).toUpperCase() : '';
        const res = await sendMemberEmail({
          to: email,
          subject: `AWIVEST contribution receipt for ${amount}`,
          heading: 'Contribution received',
          bodyHtml: `<p style="margin:0 0 12px;">Hi ${prof?.full_name || 'there'},</p>
<p style="margin:0 0 12px;">We have received and recorded your contribution to the AWIVEST fund. Thank you.</p>
<table style="border-collapse:collapse;margin:0 0 14px;font-size:14px;">
  <tr><td style="padding:4px 12px 4px 0;color:#6a6a6a;">Amount</td><td style="padding:4px 0;font-weight:700;">${amount}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6a6a6a;">Date recorded</td><td style="padding:4px 0;">${when}</td></tr>
  ${method ? `<tr><td style="padding:4px 12px 4px 0;color:#6a6a6a;">Method</td><td style="padding:4px 0;">${method}</td></tr>` : ''}
  ${ref ? `<tr><td style="padding:4px 12px 4px 0;color:#6a6a6a;">Reference</td><td style="padding:4px 0;">${ref}</td></tr>` : ''}
</table>
<p style="margin:0;">You can view your full contribution history and balance any time by signing in to the AWIVEST Investor Portal.</p>`,
        }).catch((e: any) => ({ ok: false as const, error: e?.message || 'send-failed' }));

        if (res.ok) {
          const { error: upErr } = await admin
            .from('contributions')
            .update({ receipt_sent_at: new Date().toISOString() })
            .eq('id', c.id)
            .is('receipt_sent_at', null); // guard against a concurrent run double-stamping
          if (upErr) {
            receiptErrors.push(`stamp ${c.id}: ${upErr.message}`);
          } else {
            receiptsSent++;
          }
        } else if (res.error) {
          receiptErrors.push(res.error);
        }
      }
    } catch (e: any) {
      console.error('notifications: receipts job failed:', e?.message || e);
      receiptErrors.push(e?.message || 'receipts-failed');
    }
  }

  // ==========================================================================
  // JOB 2 — deposit-deadline reminders (gated; default OFF)
  // ==========================================================================
  let remindersSent = 0;
  const reminderErrors: string[] = [];
  let reminderWindowOpen = false;
  let deadlineLabel = '';
  if (remindersEnabled) {
    try {
      // "Now" as EAT wall-clock (Africa/Nairobi is a fixed UTC+3, no DST).
      const eatNow = new Date(Date.now() + 3 * 3600 * 1000);
      const y = eatNow.getUTCFullYear();
      const m = eatNow.getUTCMonth(); // 0-based
      const today = eatNow.getUTCDate();
      const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const dueDay = Math.min(deadlineDay, daysInMonth);
      const period = `${y}-${String(m + 1).padStart(2, '0')}`;
      const deadlineDate = new Date(`${period}-${String(dueDay).padStart(2, '0')}T00:00:00+03:00`);
      deadlineLabel = fmtDate(deadlineDate);

      // Fire in the lead-up window: from (deadline - leadDays) up to, but not
      // including, the deadline day. One reminder per member per period (dedup).
      reminderWindowOpen = today >= dueDay - leadDays && today < dueDay;

      if (reminderWindowOpen) {
        const { data: finRows } = await admin
          .from('member_finances')
          .select('member_no, member_id, full_name')
          .eq('status', 'active')
          .not('member_id', 'is', null);
        const fins = (finRows ?? []) as FinanceRow[];

        const memberIds = Array.from(new Set(fins.map((f) => f.member_id).filter(Boolean))) as string[];
        let profById = new Map<string, ProfileRow>();
        if (memberIds.length) {
          const { data: profs } = await admin
            .from('profiles')
            .select('id, full_name, email')
            .in('id', memberIds);
          profById = new Map(((profs ?? []) as ProfileRow[]).map((p) => [p.id, p]));
        }

        // Which of these members were already reminded this period?
        const keys = fins.map((f) => `contribution_reminder:${f.member_no}:${period}`);
        const alreadySent = new Set<string>();
        if (keys.length) {
          const { data: st } = await admin
            .from('notification_state')
            .select('notif_key')
            .in('notif_key', keys);
          for (const s of (st ?? []) as { notif_key: string }[]) alreadySent.add(s.notif_key);
        }

        for (const f of fins) {
          const key = `contribution_reminder:${f.member_no}:${period}`;
          if (alreadySent.has(key)) continue;
          const prof = f.member_id ? profById.get(f.member_id) : undefined;
          const email = (prof?.email || '').trim();
          if (!email) continue;

          const res = await sendMemberEmail({
            to: email,
            subject: `AWIVEST monthly deposit reminder (due ${deadlineLabel})`,
            heading: 'Monthly contribution reminder',
            bodyHtml: `<p style="margin:0 0 12px;">Hi ${prof?.full_name || f.full_name || 'there'},</p>
<p style="margin:0 0 12px;">This is a friendly reminder that your monthly contribution to the AWIVEST fund is due by <strong>${deadlineLabel}</strong>.</p>
<p style="margin:0 0 12px;">Making your deposit on time keeps your fund position growing. Once it is received we will email you a receipt automatically.</p>
<p style="margin:0;">Sign in to the AWIVEST Investor Portal any time to view your balance and contribution history. Thank you.</p>`,
          }).catch((e: any) => ({ ok: false as const, error: e?.message || 'send-failed' }));

          if (res.ok) {
            const { error: insErr } = await admin
              .from('notification_state')
              .upsert(
                { notif_key: key, sent_at: new Date().toISOString(), meta: { member_no: f.member_no, period } },
                { onConflict: 'notif_key' },
              );
            if (insErr) reminderErrors.push(`state ${key}: ${insErr.message}`);
            else remindersSent++;
          } else if (res.error) {
            reminderErrors.push(res.error);
          }
        }
      }
    } catch (e: any) {
      console.error('notifications: reminders job failed:', e?.message || e);
      reminderErrors.push(e?.message || 'reminders-failed');
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: nowIso,
    receipts: {
      enabled: receiptsEnabled,
      sent: receiptsSent,
      skippedNoEmail: receiptsSkippedNoEmail,
      errors: receiptErrors.slice(0, 5),
    },
    reminders: {
      enabled: remindersEnabled,
      windowOpen: reminderWindowOpen,
      deadline: deadlineLabel || null,
      deadlineDay,
      leadDays,
      sent: remindersSent,
      errors: reminderErrors.slice(0, 5),
    },
  });
}
