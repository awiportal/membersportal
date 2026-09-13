import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { KES } from '@/lib/format';
import { computeFundSummary, FIN_COLUMNS, type FinRow } from '@/lib/fundReport';
import { displayRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

// Treasurer landing (#155): a financial-operations command centre. Treasurer is
// a normal staff role, so every read below goes through the standard RLS server
// client — the same pattern as /staff/reports, /staff/withdrawals and
// /staff/welfare. Nothing here writes.

const sumAmt = (rows: any[]) => rows.reduce((t, r) => t + Number(r?.amount || 0), 0);

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

function actionLabel(a?: string | null) {
  if (!a) return '—';
  return a.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Audit-log actions that represent a money / fund change worth showing a
// treasurer. Matched by substring against the action strings the server actions
// actually write (e.g. withdrawal_submitted, welfare_paid, exit_settlement_*).
const FINANCE_HINTS = [
  'withdrawal',
  'welfare',
  'exit_settlement',
  'exit',
  'contribution',
  'fund',
  'dividend',
  'interest',
  'import',
  'statement',
  'membership_linked',
  'payout',
  'refund',
  'disburse',
  'deposit',
];
const isFinanceAction = (a?: string | null) => !!a && FINANCE_HINTS.some((h) => a.includes(h));

function metaAmount(meta: any) {
  if (!meta || typeof meta !== 'object') return '';
  const amt = meta.amount ?? meta.net ?? meta.gross ?? meta.net_payable;
  return amt != null && !isNaN(Number(amt)) ? KES(Number(amt)) : '';
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

const LINKS: { href: string; ic: string; t: string; d: string; lime?: boolean }[] = [
  { href: '/staff/reports', ic: 'fa-chart-column', t: 'Reports & distribution', d: 'Live fund position, breakdown and CSV export.' },
  { href: '/staff/fund-data', ic: 'fa-database', t: 'Contributions & fund data', d: 'Post contributions, imports, withdrawals and exits.', lime: true },
  { href: '/staff/withdrawals', ic: 'fa-money-bill-wave', t: 'Withdrawals', d: 'Review, approve and mark payouts paid.', lime: true },
  { href: '/staff/statements', ic: 'fa-file-invoice-dollar', t: 'Member statements', d: "Open, print and issue any member's statement." },
];

export default async function TreasurerDashboard({
  role,
  title,
}: {
  role?: string | null;
  title?: string | null;
}) {
  const supabase = createClient();

  const [finRes, wRes, welRes, auditRes] = await Promise.all([
    supabase.from('member_finances').select(FIN_COLUMNS),
    supabase.from('withdrawal_requests').select('id, member_id, amount, status, created_at'),
    supabase.from('welfare_claims').select('id, member_id, amount, status, filed_at'),
    supabase
      .from('audit_log')
      .select('id, actor_id, member_id, action, meta, created_at')
      .order('created_at', { ascending: false })
      .limit(60),
  ]);

  const s = computeFundSummary((finRes.data ?? []) as FinRow[]);

  const wReqs = (wRes.data ?? []) as any[];
  // "Pending" = still open in the workflow (submitted, under review, or approved
  // and awaiting payout) — everything that is not yet paid/rejected/cancelled.
  const pendingW = wReqs.filter((r) => ['submitted', 'under_review', 'approved'].includes(r.status));

  const welfare = (welRes.data ?? []) as any[];
  const pendingWel = welfare.filter((c) => c.status === 'pending');

  const auditAll = (auditRes.data ?? []) as any[];
  const finance = auditAll.filter((r) => isFinanceAction(r.action)).slice(0, 6);

  // Names for the recent-changes list (best effort; RLS staff read on profiles).
  const ids = Array.from(new Set(finance.flatMap((r) => [r.actor_id, r.member_id]).filter(Boolean))) as string[];
  let nameById = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, email, investor_id')
      .in('id', ids);
    nameById = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.full_name || p.email || p.investor_id || '—']));
  }

  const kpis: { label: string; value: string; sub: string; icon: string; accent?: boolean }[] = [
    { label: 'Fund under management', value: KES(s.total), sub: `${s.members.length} members · incl. fund accounts`, icon: 'fa-vault', accent: true },
    { label: '2026 contributions (YTD)', value: KES(s.contributions), sub: 'Posted to the register this year', icon: 'fa-hand-holding-dollar' },
    { label: 'Pending withdrawals', value: String(pendingW.length), sub: pendingW.length ? `${KES(sumAmt(pendingW))} awaiting action` : 'None outstanding', icon: 'fa-money-bill-transfer', accent: pendingW.length > 0 },
    { label: 'Pending welfare claims', value: String(pendingWel.length), sub: pendingWel.length ? `${KES(sumAmt(pendingWel))} to assess` : 'None outstanding', icon: 'fa-hand-holding-heart', accent: pendingWel.length > 0 },
  ];

  return (
    <div>
      <div className="page-title">Treasurer dashboard</div>
      <div className="sub">
        Financial operations for the {displayRole(role, title)} — fund position, contributions and the money-out
        queues at a glance.
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', margin: '18px 0 4px' }}>
        {kpis.map((k) => (
          <div key={k.label} className="card kpi">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="lbl">{k.label}</span>
              <span
                className={`ic ${k.accent ? 'grad-lime' : ''}`}
                style={{ background: k.accent ? undefined : 'var(--surface2)', color: k.accent ? '#20260a' : 'var(--lime2)' }}
              >
                <i className={`fa-solid ${k.icon}`} />
              </span>
            </div>
            <div className="val num">{k.value}</div>
            <div style={{ fontSize: 11.5, marginTop: 4, fontWeight: 600, color: 'var(--muted)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>
          Recent finance changes <span className="muted">({finance.length})</span>
        </div>
        {finance.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No recent finance changes recorded.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>When</th>
                  <th style={th}>Change</th>
                  <th style={th}>Member</th>
                  <th style={thr}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {finance.map((r) => (
                  <tr key={r.id}>
                    <td style={td} className="num muted">{fmtWhen(r.created_at)}</td>
                    <td style={td}><span className="badge badge-info">{actionLabel(r.action)}</span></td>
                    <td style={td}>{r.member_id ? nameById.get(r.member_id) || '—' : <span className="muted">—</span>}</td>
                    <td style={tdr} className="num">{metaAmount(r.meta)}</td>
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
            <span className={`tile-ic${h.lime ? ' lime' : ''}`}>
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
