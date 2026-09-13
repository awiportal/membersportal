import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { KES } from '@/lib/format';
import { computeFundSummary, FIN_COLUMNS, n, type FinRow } from '@/lib/fundReport';
import { displayRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// Auditor landing (#155): READ-ONLY governance oversight. The auditor role is
// SELECT-only at the database (auditor_read RLS policies) and this screen
// performs NO writes. The RLS-audit function and the auth_rate_limits table are
// reachable only through the service-role admin client (rls_audit() grants
// execute to service_role only; auth_rate_limits has RLS enabled with zero
// policies) — exactly the pattern /staff/security and /staff/audit already use
// behind a role gate. The gate here is StaffHome, which only renders this
// component for role 'auditor', inside the (staff) layout that already enforces
// canViewStaffConsole. member_finances is read with the standard RLS client
// (the auditor_read SELECT policy grants it).

function fmtWhen(ts?: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtMeta(meta: any): string {
  if (meta == null) return '';
  if (typeof meta === 'string') return meta;
  try {
    return Object.entries(meta)
      .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
      .join('  ·  ');
  } catch {
    return '';
  }
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '2px solid var(--border)',
  fontSize: 10.5,
  textTransform: 'uppercase',
  letterSpacing: '.03em',
  color: 'var(--muted2)',
};
const thr: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  fontSize: 12.5,
  verticalAlign: 'top',
};
const tdr: React.CSSProperties = { ...td, textAlign: 'right' };

const LINKS: { href: string; ic: string; t: string; d: string }[] = [
  { href: '/staff/reports', ic: 'fa-chart-column', t: 'Reports & distribution', d: 'Live fund position, breakdown and CSV export.' },
  { href: '/staff/audit', ic: 'fa-clipboard-list', t: 'Audit log', d: 'The full system-wide action trail.' },
  { href: '/staff/security', ic: 'fa-shield-halved', t: 'Security', d: 'Password policy, backups and the RLS audit.' },
];

const AUDIT_LIMIT = 10;
const RL_WINDOW_HOURS = 24; // opportunistic cleanup drops buckets older than 1 day
const RL_ELEVATED = 5; // hits within a window at/above this may signal stuffing/flooding

export default async function AuditorDashboard({
  role,
  title,
}: {
  role?: string | null;
  title?: string | null;
}) {
  const supabase = createClient();

  // 1) Ledger reconciliation from member_finances (auditor_read RLS SELECT).
  const { data: finData } = await supabase.from('member_finances').select(FIN_COLUMNS);
  const finRows = (finData ?? []) as FinRow[];
  const haveFin = finRows.filter((r) => r.status !== 'sample').length > 0;
  const s = computeFundSummary(finRows);
  const openingSum = s.rows.reduce((a, r) => a + n(r.opening_balance_2025), 0);
  const components = openingSum + s.contributions + s.interest;
  const expected = components - s.withdrawals; // exit payouts already disbursed
  const diff = s.total - expected;
  const reconciled = Math.abs(diff) < 0.01;

  // 2) RLS audit + 3) auth rate-limit anomalies + 4) latest audit events — all
  // via the service-role admin client (see header note). Fail-soft per section.
  let rls: any[] = [];
  let rlsError: string | null = null;
  let rateRows: any[] | null = null;
  let auditRows: any[] = [];
  let nameById = new Map<string, string>();
  try {
    const admin = createAdminClient();
    const [rlsRes, rateRes, auditRes] = await Promise.all([
      admin.rpc('rls_audit'),
      admin.from('auth_rate_limits').select('bucket, window_start, count').order('count', { ascending: false }).limit(500),
      admin
        .from('audit_log')
        .select('id, actor_id, member_id, action, meta, created_at')
        .order('created_at', { ascending: false })
        .limit(AUDIT_LIMIT),
    ]);
    if (rlsRes.error) rlsError = rlsRes.error.message;
    else rls = (rlsRes.data ?? []) as any[];
    rateRows = (rateRes.data ?? []) as any[];
    auditRows = (auditRes.data ?? []) as any[];

    const ids = Array.from(new Set(auditRows.flatMap((r) => [r.actor_id, r.member_id]).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await admin.from('profiles').select('id, full_name, email, investor_id').in('id', ids);
      nameById = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.full_name || p.email || p.investor_id || '—']));
    }
  } catch (e: any) {
    rlsError = rlsError || (e?.message || 'Service-role client unavailable.');
  }

  const flagged = rls.filter((r) => !r.rls_enabled || Number(r.policy_count || 0) === 0);
  const withRls = rls.filter((r) => r.rls_enabled).length;

  const cutoff = Date.now() - RL_WINDOW_HOURS * 3600 * 1000;
  const activeBuckets = (rateRows ?? []).filter((r) => {
    const t = new Date(r.window_start).getTime();
    return isNaN(t) ? true : t >= cutoff;
  });
  const elevated = activeBuckets.filter((r) => Number(r.count || 0) >= RL_ELEVATED);
  const topBuckets = [...activeBuckets].sort((a, b) => Number(b.count || 0) - Number(a.count || 0)).slice(0, 5);

  return (
    <div>
      <div className="page-title">Auditor dashboard</div>
      <div className="sub">
        Read-only oversight for the {displayRole(role, title)} — row-level-security posture, the audit trail, auth
        anomalies and a live ledger reconciliation. <span className="badge badge-info">Read-only</span>
      </div>

      {/* Ledger reconciliation */}
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            <i className="fa-solid fa-scale-balanced" style={{ marginRight: 8, opacity: 0.7 }} />Ledger reconciliation
          </div>
          {!haveFin ? (
            <span className="badge">No data</span>
          ) : reconciled ? (
            <span className="badge badge-good"><i className="fa-solid fa-circle-check" /> Reconciled</span>
          ) : (
            <span className="badge badge-bad"><i className="fa-solid fa-triangle-exclamation" /> Divergence {KES(Math.abs(diff))}</span>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12.5, margin: '8px 0 12px' }}>
          Sum of member records (opening balances + 2026 contributions + interest, less exit payouts) checked against
          the live fund pool total. Exact to the cent.
        </div>
        {haveFin ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td style={td}>Opening balances (to 2025)</td><td style={tdr} className="num">{KES(openingSum)}</td></tr>
                <tr><td style={td}>+ 2026 contributions</td><td style={tdr} className="num">{KES(s.contributions)}</td></tr>
                <tr><td style={td}>+ Interest 2026</td><td style={tdr} className="num">{KES(s.interest)}</td></tr>
                <tr><td style={td}>− Exit payouts disbursed</td><td style={tdr} className="num">{KES(s.withdrawals)}</td></tr>
                <tr><td style={{ ...td, fontWeight: 700 }}>Expected fund total</td><td style={{ ...tdr, fontWeight: 700 }} className="num">{KES(expected)}</td></tr>
                <tr><td style={{ ...td, fontWeight: 700 }}>Fund pool total (current balances)</td><td style={{ ...tdr, fontWeight: 700 }} className="num">{KES(s.total)}</td></tr>
                <tr>
                  <td style={{ ...td, color: reconciled ? 'var(--muted)' : 'var(--bad)' }}>Difference</td>
                  <td style={{ ...tdr, color: reconciled ? 'var(--muted)' : 'var(--bad)' }} className="num">{KES(diff)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12.5 }}>No fund records are readable for this role.</div>
        )}
      </div>

      {/* RLS audit summary */}
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            <i className="fa-solid fa-table-cells-large" style={{ marginRight: 8, opacity: 0.7 }} />Row-level security audit
          </div>
          {rlsError ? (
            <span className="badge badge-bad"><i className="fa-solid fa-circle-xmark" /> Unavailable</span>
          ) : flagged.length ? (
            <span className="badge badge-bad"><i className="fa-solid fa-triangle-exclamation" /> {flagged.length} to review</span>
          ) : (
            <span className="badge badge-good"><i className="fa-solid fa-circle-check" /> All tables protected</span>
          )}
        </div>
        {rlsError ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Could not run the RLS audit: {rlsError}</div>
        ) : rls.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>No tables returned.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', margin: '8px 0 4px', fontSize: 13 }}>
              <span className="muted">Tables <strong className="num" style={{ color: 'var(--text)' }}>{rls.length}</strong></span>
              <span className="muted">RLS enabled <strong className="num" style={{ color: 'var(--text)' }}>{withRls}</strong></span>
              <span className="muted">Flagged <strong className="num" style={{ color: flagged.length ? 'var(--bad)' : 'var(--text)' }}>{flagged.length}</strong></span>
            </div>
            {flagged.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {flagged.map((r) => (
                  <span key={r.table_name} className="badge badge-bad" style={{ fontSize: 10.5 }}>{r.table_name}</span>
                ))}
              </div>
            )}
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Full table-by-table detail is on <Link href="/staff/security">Security</Link>.
            </div>
          </>
        )}
      </div>

      {/* Authentication anomalies */}
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            <i className="fa-solid fa-user-lock" style={{ marginRight: 8, opacity: 0.7 }} />Authentication anomalies
          </div>
          {rateRows === null ? (
            <span className="badge badge-bad"><i className="fa-solid fa-circle-xmark" /> Unavailable</span>
          ) : elevated.length ? (
            <span className="badge badge-warn"><i className="fa-solid fa-triangle-exclamation" /> {elevated.length} elevated</span>
          ) : (
            <span className="badge badge-good"><i className="fa-solid fa-circle-check" /> Normal</span>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12.5, margin: '8px 0 12px' }}>
          Fixed-window rate-limit counters from <span className="num">auth_rate_limits</span> (login and OTP
          protection). A bucket with {RL_ELEVATED}+ hits inside its current window can indicate credential stuffing or
          OTP flooding.
        </div>
        {rateRows === null ? (
          <div className="muted" style={{ fontSize: 12.5 }}>The rate-limit table could not be read.</div>
        ) : activeBuckets.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>No authentication rate-limit activity in the last {RL_WINDOW_HOURS} hours.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10, fontSize: 13 }}>
              <span className="muted">Active buckets <strong className="num" style={{ color: 'var(--text)' }}>{activeBuckets.length}</strong></span>
              <span className="muted">Elevated <strong className="num" style={{ color: elevated.length ? 'var(--bad)' : 'var(--text)' }}>{elevated.length}</strong></span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Bucket</th>
                    <th style={thr}>Hits</th>
                    <th style={th}>Window since</th>
                  </tr>
                </thead>
                <tbody>
                  {topBuckets.map((r) => (
                    <tr key={r.bucket}>
                      <td style={td} className="num" title={r.bucket}>{r.bucket}</td>
                      <td style={tdr} className="num">
                        {Number(r.count || 0) >= RL_ELEVATED ? (
                          <span className="badge badge-bad" style={{ fontSize: 10.5 }}>{Number(r.count || 0)}</span>
                        ) : (
                          Number(r.count || 0)
                        )}
                      </td>
                      <td style={td} className="num muted">{fmtWhen(r.window_start)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Latest audit events */}
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>Latest audit events</div>
          <span className="badge badge-info">Live · latest {AUDIT_LIMIT}</span>
        </div>
        {auditRows.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>No audit events recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr>
                  <th style={th}>When</th>
                  <th style={th}>Action</th>
                  <th style={th}>Actor</th>
                  <th style={th}>Member</th>
                  <th style={th}>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((r) => (
                  <tr key={r.id}>
                    <td style={td} className="num muted">{fmtWhen(r.created_at)}</td>
                    <td style={td}><span className="badge badge-info">{r.action}</span></td>
                    <td style={td}>{r.actor_id ? nameById.get(r.actor_id) || '—' : <span className="muted">system</span>}</td>
                    <td style={td}>{r.member_id ? nameById.get(r.member_id) || '—' : <span className="muted">—</span>}</td>
                    <td style={{ ...td, fontSize: 12, wordBreak: 'break-word' }} className="muted">{fmtMeta(r.meta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="hub-head">
        <div className="eyebrow">Jump to a console</div>
        <div className="line" />
      </div>
      <div className="tilegrid">
        {LINKS.map((h) => (
          <Link key={h.href} href={h.href} className="tile">
            <span className="tile-ic">
              <i className={`fa-solid ${h.ic}`} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="tile-t">{h.t}</div>
              <div className="tile-d">{h.d}</div>
            </div>
            <i className="fa-solid fa-arrow-right tile-arrow" />
          </Link>
        ))}
      </div>
    </div>
  );
}
