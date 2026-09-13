import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMemberEmail } from '@/lib/email';
import { isAuthorizedCron } from '@/lib/cron';
import { roleLabel } from '@/lib/roles';

// Admin-tier roles (Admin + Chairlady) — the roster we watch for new grants.
const ADMIN_TIER = ['admin', 'superadmin'];

// #180 — Real-time security / anomaly alerts.
//
// Runs on a Vercel Cron (every 15 min; see web/vercel.json). On each run it
// reads two REAL persistent signals through the SERVICE-ROLE admin client
// (exactly as /staff/security and /staff/audit read RLS-protected data) and
// emails every current Admin/Chairlady when something fires:
//
//   1) Auth-abuse spikes — rows in auth_rate_limits whose count has reached the
//      bucket's own cap inside its live fixed window: repeated sign-in attempts
//      from one IP (login:ip:*, credential stuffing), OTP brute force
//      (2fa-check:*), or OTP request flooding (2fa-send:*).
//   2) New Admin/Chairlady grants — a login that is now admin-tier but was not
//      on the previous run (detected by diffing the live roster against a stored
//      snapshot; see the "role grants" note below for why this, not audit_log).
//
// Dedup is via public.security_alert_state so the same event is never emailed
// twice: per-bucket we remember the window_start we last alerted on (a fresh
// window re-alerts, a still-open one does not); the roster is a stored snapshot.
//
// The endpoint is idempotent and safe to invoke manually (same bearer header) —
// re-running with no new signal sends nothing.
//
// Runtime: Node (default) — it uses the service-role client and process.env,
// neither of which belongs on the Edge runtime.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// NOTE (Vercel cron config — web/vercel.json): cron schedules run in UTC. This
// route is scheduled every 15 minutes. If the project's Vercel plan restricts
// cron frequency, the schedule can be relaxed to daily with no code change: the
// handler is idempotent and safe to invoke manually (per-event dedup means the
// same anomaly is never emailed twice regardless of how often it runs).

// Only surface a spike once the bucket has reached the SAME cap the app enforces
// for it — that is exactly the point at which the limiter is being hit, which is
// the anomaly. Buckets are created in web/app/login/actions.ts (login:ip:) and
// web/app/verify/actions.ts (2fa-send:, 2fa-check:).
const SPIKE_RULES: { prefix: string; cap: number; kind: string; ident: 'ip' | 'user' }[] = [
  { prefix: 'login:ip:', cap: 10, kind: 'Repeated sign-in attempts', ident: 'ip' },
  { prefix: '2fa-check:', cap: 10, kind: 'Repeated 2FA code attempts (OTP brute force)', ident: 'user' },
  { prefix: '2fa-send:', cap: 5, kind: 'Repeated 2FA code requests (OTP flooding)', ident: 'user' },
];

// Consider only windows that started within this lookback as "active". With the
// */15 schedule this comfortably covers the 5–15 min fixed windows; if the
// schedule is later relaxed to daily, a current spike is still caught and older,
// already-reset windows are correctly ignored.
const LOOKBACK_MINUTES = 60;

function fmtWhen(ts: string | null): string {
  if (!ts) return 'unknown time';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return 'unknown time';
  return d.toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

function esc(s: string): string {
  return String(s).replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
}

type RateRow = { bucket: string; window_start: string; count: number };
type StateRow = { alert_key: string; cursor_ts: string | null; meta: any };
type ProfileRow = { id: string; role: string | null; full_name: string | null; email: string | null };

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e: any) {
    // Missing/invalid service-role key: surface it so a manual run shows the fix.
    return NextResponse.json({ ok: false, error: e?.message || 'admin-client-unavailable' }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const sinceIso = new Date(Date.now() - LOOKBACK_MINUTES * 60_000).toISOString();

  // ---- Signal 1: auth-abuse spikes from auth_rate_limits --------------------
  const spikeAlerts: { bucket: string; window_start: string; count: number; text: string }[] = [];
  try {
    const { data: rlRows } = await admin
      .from('auth_rate_limits')
      .select('bucket, window_start, count')
      .gte('window_start', sinceIso);
    const rows = ((rlRows ?? []) as RateRow[]).filter((r) => {
      const rule = SPIKE_RULES.find((x) => r.bucket.startsWith(x.prefix));
      return rule ? Number(r.count) >= rule.cap : false;
    });

    // Extract the identifier tail (IP or user id) that follows a matched prefix.
    const identOf = (bucket: string, rule: (typeof SPIKE_RULES)[number]) => bucket.slice(rule.prefix.length);

    // Resolve the user id embedded in 2fa buckets to a readable name/email.
    const uidSet = new Set<string>();
    for (const r of rows) {
      const rule = SPIKE_RULES.find((x) => r.bucket.startsWith(x.prefix))!;
      if (rule.ident === 'user') uidSet.add(identOf(r.bucket, rule));
    }
    let nameByUid = new Map<string, string>();
    if (uidSet.size) {
      const { data: profs } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', Array.from(uidSet));
      nameByUid = new Map(
        ((profs ?? []) as ProfileRow[]).map((p) => [p.id, p.full_name || p.email || p.id]),
      );
    }

    // Load per-bucket dedup cursors in one query.
    const keys = rows.map((r) => `authspike:${r.bucket}`);
    let cursorByKey = new Map<string, string | null>();
    if (keys.length) {
      const { data: st } = await admin
        .from('security_alert_state')
        .select('alert_key, cursor_ts, meta')
        .in('alert_key', keys);
      cursorByKey = new Map(((st ?? []) as StateRow[]).map((s) => [s.alert_key, s.cursor_ts]));
    }

    for (const r of rows) {
      const rule = SPIKE_RULES.find((x) => r.bucket.startsWith(x.prefix))!;
      const key = `authspike:${r.bucket}`;
      const prev = cursorByKey.get(key) ?? null;
      // Only alert when this window is newer than the last one we alerted on for
      // this bucket — a still-open window keeps the same window_start, a reset
      // window advances it.
      if (prev && new Date(r.window_start).getTime() <= new Date(prev).getTime()) continue;

      const ident = identOf(r.bucket, rule);
      const who = rule.ident === 'ip' ? `IP ${ident}` : (nameByUid.get(ident) || `account ${ident}`);
      spikeAlerts.push({
        bucket: r.bucket,
        window_start: r.window_start,
        count: Number(r.count),
        text: `${rule.kind}: ${who}. ${Number(r.count)} attempts in the window that started ${fmtWhen(r.window_start)}.`,
      });
    }
  } catch (e: any) {
    console.error('security-alerts: spike scan failed:', e?.message || e);
  }

  // ---- Signal 2: new Admin/Chairlady (admin-tier) grants --------------------
  //
  // NOTE ON SOURCE: role grants are NOT persisted to audit_log. The role change
  // path (web/app/(staff)/staff/roles/actions.ts) is a plain profiles UPDATE,
  // and guard_profile_role_change() only RAISES on an unauthorised change — it
  // writes no row. So "since the last run using audit_log" has no signal to read.
  // Instead we diff the LIVE admin-tier roster (a real, persistent source) against
  // a snapshot we keep in security_alert_state — this actually fires, and it also
  // catches a grant made directly in the DB, which an app-only audit row would miss.
  const roleAlerts: string[] = [];
  let currentAdmins: ProfileRow[] = [];
  let firstRosterRun = false;
  try {
    const { data: adm } = await admin
      .from('profiles')
      .select('id, role, full_name, email')
      .in('role', ADMIN_TIER);
    currentAdmins = (adm ?? []) as ProfileRow[];

    const { data: snapRows } = await admin
      .from('security_alert_state')
      .select('alert_key, cursor_ts, meta')
      .eq('alert_key', 'admin_roster')
      .limit(1);
    const snap = ((snapRows ?? []) as StateRow[])[0];
    if (!snap) {
      // First run ever: seed the snapshot WITHOUT alerting, so we don't report
      // the entire existing admin team as if newly granted.
      firstRosterRun = true;
    } else {
      const prevIds = new Set<string>(
        Array.isArray(snap.meta?.admins)
          ? (snap.meta.admins as { id: string }[]).map((a) => a.id).filter(Boolean)
          : [],
      );
      for (const a of currentAdmins) {
        if (a.id && !prevIds.has(a.id)) {
          roleAlerts.push(
            `New ${roleLabel(a.role)} access: ${a.full_name || a.email || a.id}${a.email ? ` (${a.email})` : ''}.`,
          );
        }
      }
    }
  } catch (e: any) {
    console.error('security-alerts: roster diff failed:', e?.message || e);
  }

  // ---- Recipients: every current Admin/Chairlady with an email --------------
  const recipients = currentAdmins.filter((a) => (a.email || '').trim());

  const hasAlerts = spikeAlerts.length > 0 || roleAlerts.length > 0;
  let emailed = 0;
  const emailErrors: string[] = [];

  if (hasAlerts && recipients.length) {
    const sections: string[] = [];
    if (roleAlerts.length) {
      sections.push(
        `<h2 style="font-size:15px;margin:18px 0 8px;">New Admin / Chairlady access</h2><ul style="margin:0 0 4px;padding-left:18px;">${roleAlerts
          .map((t) => `<li style="margin:0 0 6px;">${esc(t)}</li>`)
          .join('')}</ul>`,
      );
    }
    if (spikeAlerts.length) {
      sections.push(
        `<h2 style="font-size:15px;margin:18px 0 8px;">Authentication abuse</h2><ul style="margin:0 0 4px;padding-left:18px;">${spikeAlerts
          .map((a) => `<li style="margin:0 0 6px;">${esc(a.text)}</li>`)
          .join('')}</ul>`,
      );
    }
    const bodyHtml = `<p style="margin:0 0 12px;">The portal detected the following security signal(s) at ${fmtWhen(
      nowIso,
    )} (UTC):</p>${sections.join(
      '',
    )}<p style="margin:16px 0 0;color:#6a6a6a;font-size:12.5px;">Review in the staff console under Security and Audit log. This is an automated monitoring alert (#180); times are UTC.</p>`;

    const subjectBits: string[] = [];
    if (roleAlerts.length) subjectBits.push('new admin access');
    if (spikeAlerts.length) subjectBits.push('auth abuse');
    const subject = `AWIVEST security alert: ${subjectBits.join(' + ')}`;

    const results = await Promise.all(
      recipients.map((a) =>
        sendMemberEmail({
          to: a.email,
          subject,
          heading: 'Security alert',
          bodyHtml: `<p style="margin:0 0 12px;">Hi ${esc(a.full_name || 'there')},</p>${bodyHtml}`,
        }).catch((e: any) => ({ ok: false, error: e?.message || 'send-failed' })),
      ),
    );
    emailed = results.filter((r) => r.ok).length;
    for (const r of results) if (!r.ok && r.error) emailErrors.push(r.error);
  }

  // ---- Advance dedup state (best-effort, after the send attempt) ------------
  try {
    if (spikeAlerts.length) {
      const upserts = spikeAlerts.map((a) => ({
        alert_key: `authspike:${a.bucket}`,
        cursor_ts: a.window_start,
        meta: { count: a.count },
        updated_at: nowIso,
      }));
      await admin.from('security_alert_state').upsert(upserts, { onConflict: 'alert_key' });
    }
    // Always refresh the roster snapshot (also seeds it on the first run).
    if (firstRosterRun || roleAlerts.length || currentAdmins.length) {
      await admin.from('security_alert_state').upsert(
        {
          alert_key: 'admin_roster',
          cursor_ts: nowIso,
          meta: { admins: currentAdmins.map((a) => ({ id: a.id, role: a.role })) },
          updated_at: nowIso,
        },
        { onConflict: 'alert_key' },
      );
    }
  } catch (e: any) {
    console.error('security-alerts: state upsert failed:', e?.message || e);
  }

  return NextResponse.json({
    ok: true,
    ranAt: nowIso,
    spikeAlerts: spikeAlerts.length,
    roleGrantAlerts: roleAlerts.length,
    recipients: recipients.length,
    emailed,
    emailErrors: emailErrors.slice(0, 5),
    seededRosterSnapshot: firstRosterRun,
  });
}
