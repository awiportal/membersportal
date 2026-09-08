import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isStaff } from '@/lib/roles';
import { KES } from '@/lib/format';
import AreaChart from '@/components/AreaChart';
import Donut, { Segment } from '@/components/Donut';
import ReportExport from './ReportExport';

export const dynamic = 'force-dynamic';

type Row = {
  member_no: string;
  full_name: string;
  status: string;
  opening_balance_2025: number;
  contributions_2026: number;
  britam_interest_2026: number;
  jubilee_interest_2026: number;
  total_interest_2026: number;
  current_balance: number;
  refund_on_exit: number;
};

const n = (v: unknown) => Number(v || 0);

// Reports & fund distribution — the staff view of the whole AWIVEST register.
// Every figure is aggregated LIVE from member_finances (RLS: is_staff() reads
// all rows), so it tracks the real 48-member workbook rather than a fixed seed.
export default async function StaffReportsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');

  const { data: rowsData } = await supabase
    .from('member_finances')
    .select(
      'member_no, full_name, status, opening_balance_2025, contributions_2026, britam_interest_2026, jubilee_interest_2026, total_interest_2026, current_balance, refund_on_exit'
    )
    .order('current_balance', { ascending: false });
  const rows = (rowsData ?? []) as Row[];

  const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const total = sum((r) => n(r.current_balance));
  const active = rows.filter((r) => r.status === 'active').length;
  const exiting = rows.filter((r) => r.status === 'exiting').length;
  const exited = rows.filter((r) => r.status === 'exited').length;
  const totalExclExits = sum((r) => (r.status === 'exited' ? 0 : n(r.current_balance)));
  const opening = sum((r) => n(r.opening_balance_2025));
  const contributions = sum((r) => n(r.contributions_2026));
  const interest = sum((r) => n(r.total_interest_2026));
  const britam = sum((r) => n(r.britam_interest_2026));
  const jubilee = sum((r) => n(r.jubilee_interest_2026));
  const withdrawals = sum((r) => n(r.refund_on_exit));

  const kpis = [
    { l: 'Fund under management', v: KES(total), i: 'fa-vault', a: true },
    { l: 'Balance excl. exits', v: KES(totalExclExits), i: 'fa-scale-balanced' },
    { l: '2026 contributions (YTD)', v: KES(contributions), i: 'fa-hand-holding-dollar' },
    { l: 'Interest earned 2026', v: KES(interest), i: 'fa-chart-line' },
  ];

  // Distribution of the current fund by origin: opening balance carried in +
  // 2026 contributions + interest posted. These three sum to current_balance.
  const dist = [
    { label: 'Opening balance (to 2025)', value: opening, color: '#7e2674' },
    { label: '2026 contributions', value: contributions, color: '#a6cd35' },
    { label: 'Interest 2026', value: interest, color: '#5aa9f0' },
  ].filter((d) => d.value > 0);
  const segments: Segment[] = dist.map((d) => ({ label: d.label, value: d.value, color: d.color }));

  // A simple fund-position curve interpolated between the two real endpoints we
  // hold — opening balance (Dec 2025) and current balance (Jul 2026), in KES
  // millions. Honest about being interpolated (no monthly history is stored).
  const months = 7;
  const ramp = Array.from({ length: months }, (_, i) =>
    Math.round(((opening + ((total - opening) * i) / (months - 1)) / 1_000_000) * 10) / 10
  );

  const exportRows = rows.map((r) => ({
    member_no: r.member_no,
    full_name: r.full_name,
    status: r.status,
    opening: n(r.opening_balance_2025),
    contributions: n(r.contributions_2026),
    interest: n(r.total_interest_2026),
    current: n(r.current_balance),
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="page-title">Reports &amp; fund distribution</div>
          <div className="sub">
            Live from the AWIVEST register (as at 31 Jul 2026, KES). <span className="badge badge-good">Live</span>{' '}
            {active} active · {exiting} exiting · {exited} exited · {rows.length} members.
          </div>
        </div>
        <ReportExport rows={exportRows} />
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', margin: '22px 0 18px' }}>
        {kpis.map((k) => (
          <div key={k.l} className="card kpi hover-lift">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="lbl">{k.l}</span>
              <span
                className={`ic ${k.a ? 'grad-lime' : ''}`}
                style={k.a ? { color: '#20260a' } : { background: 'var(--surface2)', color: 'var(--lime2)' }}
              >
                <i className={`fa-solid ${k.i}`} />
              </span>
            </div>
            <div className="val num" style={{ fontSize: 18 }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Fund position (KES millions)</div>
          <AreaChart data={ramp} />
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Opening {KES(opening)} + contributions {KES(contributions)} + interest {KES(interest)} = {KES(total)}. Curve
            interpolates the two stored endpoints (Dec 2025 &rarr; Jul 2026).
          </div>
        </div>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Money distribution</div>
          {segments.length ? (
            <Donut segments={segments} />
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>No fund data loaded yet.</div>
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Distribution breakdown</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                <th style={{ padding: '8px 10px' }}>Component</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount (KES)</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {dist.map((d) => (
                <tr key={d.label} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 10px' }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: d.color, marginRight: 8 }} />
                    {d.label}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }} className="num">{KES(d.value)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }} className="num muted">
                    {total ? ((d.value / total) * 100).toFixed(1) : '0.0'}%
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '10px' }}>Total fund</td>
                <td style={{ padding: '10px', textAlign: 'right' }} className="num">{KES(total)}</td>
                <td style={{ padding: '10px', textAlign: 'right' }} className="num">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
        {britam > 0 || jubilee > 0 ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Interest by partner: Britam {KES(britam)} · Jubilee {KES(jubilee)}.
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Partner interest (Britam / Jubilee) posts here once the insurer statements are loaded.
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Member exits (refunds)</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {exited + exiting === 0
            ? 'No members are currently exiting or exited — the full register is active.'
            : `${exited} exited and ${exiting} exiting; refunds on exit total ${KES(withdrawals)}. Balance excluding exits is ${KES(
                totalExclExits
              )}. Exited members drop out of active reporting but remain in the audit trail.`}
        </div>
      </div>
    </div>
  );
}
