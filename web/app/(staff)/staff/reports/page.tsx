import { createClient } from '@/lib/supabase/server';
import { getSessionUser, getSessionProfile } from '@/lib/session';
import { redirect } from 'next/navigation';
import { isStaff } from '@/lib/roles';
import { KES } from '@/lib/format';
import AreaChart from '@/components/AreaChart';
import Donut, { Segment } from '@/components/Donut';
import PrintButton from '@/components/PrintButton';
import ReportExport from './ReportExport';

export const dynamic = 'force-dynamic';

type Row = {
  member_no: string;
  full_name: string;
  status: string;
  opening_balance_2025: number;
  contributions_2026: number;
  total_interest_2026: number;
  current_balance: number;
  refund_on_exit: number;
  britam_interest_life: number;
  jubilee_mmf: number;
  jubilee_fif: number;
  jubilee_fif_apr_jul: number;
};

const n = (v: unknown) => Number(v || 0);

// Reports & fund distribution — the staff view of the whole AWIVEST register.
// Every figure is aggregated LIVE from member_finances (RLS: is_staff() reads
// all rows), so it tracks the real 48-member workbook rather than a fixed seed.
export default async function StaffReportsPage() {
  const supabase = createClient();
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const me = await getSessionProfile();
  if (!isStaff(me?.role)) redirect('/staff');

  const { data: rowsData } = await supabase
    .from('member_finances')
    .select(
      'member_no, full_name, status, opening_balance_2025, contributions_2026, total_interest_2026, current_balance, refund_on_exit, britam_interest_life, jubilee_mmf, jubilee_fif, jubilee_fif_apr_jul'
    )
    .order('current_balance', { ascending: false });
  const rows = (rowsData ?? []) as Row[];

  // Two non-member fund accounts (Membership fees, Welfare) carry status
  // 'account': they belong in the fund TOTAL but not in member counts, the
  // member dropdowns or the exit logic. Members with status exiting/exited are
  // excluded from the "Total excl. exits" figure.
  const isAccount = (r: Row) => r.status === 'account';
  const isExit = (r: Row) => r.status === 'exiting' || r.status === 'exited';
  const members = rows.filter((r) => !isAccount(r));

  const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const total = sum((r) => n(r.current_balance)); // whole fund, incl. accounts
  const totalExclExits = sum((r) => (isExit(r) ? 0 : n(r.current_balance)));
  const active = members.filter((r) => r.status === 'active').length;
  const exiting = members.filter((r) => r.status === 'exiting').length;
  const exited = members.filter((r) => r.status === 'exited').length;
  const contributions = sum((r) => n(r.contributions_2026));
  const interest = sum((r) => n(r.total_interest_2026));
  // Derive opening so the distribution always reconciles to the fund total,
  // even where a withdrawal (e.g. AWI-007) sits between contributions+interest
  // and the current balance.
  const opening = total - contributions - interest;
  const britam = sum((r) => n(r.britam_interest_life));
  const jubilee = sum((r) => n(r.jubilee_mmf) + n(r.jubilee_fif) + n(r.jubilee_fif_apr_jul));
  const withdrawals = sum((r) => n(r.refund_on_exit));
  const accounts = rows.filter(isAccount);
  const accountsTotal = accounts.reduce((s, r) => s + n(r.current_balance), 0);

  // Interest split by source. Prior-year interest is whatever the total interest
  // is beyond the two insurers, so the three always reconcile to total interest.
  const priorInterest = Math.max(0, interest - britam - jubilee);
  const pctOf = (v: number) => (total ? (v / total) * 100 : 0);
  const interestParts = [
    { label: 'Britam', value: britam, color: '#a6398f', sub: 'Insurer interest (life)' },
    { label: 'Jubilee', value: jubilee, color: '#5aa9f0', sub: 'MMF + FIF' },
    { label: 'Prior years', value: priorInterest, color: '#a6cd35', sub: 'Interest to 2023' },
  ].filter((p) => p.value > 0);
  const generatedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const kpis = [
    { l: 'Fund under management', v: KES(total), i: 'fa-vault', a: true, sub: `${members.length} members · incl. fund accounts` },
    { l: 'Total excl. exits', v: KES(totalExclExits), i: 'fa-scale-balanced', sub: `${pctOf(totalExclExits).toFixed(1)}% of fund` },
    { l: '2026 contributions (YTD)', v: KES(contributions), i: 'fa-hand-holding-dollar', sub: `${pctOf(contributions).toFixed(1)}% of fund` },
    { l: 'Interest earned 2026', v: KES(interest), i: 'fa-chart-line', sub: `${pctOf(interest).toFixed(1)}% of fund` },
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

  const exportRows = members.map((r) => ({
    member_no: r.member_no,
    full_name: r.full_name,
    status: r.status,
    opening: n(r.opening_balance_2025),
    contributions: n(r.contributions_2026),
    interest: n(r.total_interest_2026),
    current: n(r.current_balance),
  }));

  return (
    <div className="rpt">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Reports &amp; fund distribution</div>
          <div className="sub">
            Live from the AWIVEST register (as at 31 Jul 2026, KES). <span className="badge badge-good"><i className="fa-solid fa-circle-check" /> Live</span>{' '}
            {active} active · {exiting} exiting · {exited} exited · {members.length} members.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <ReportExport rows={exportRows} />
          <PrintButton label="Print report" className="btn btn-primary btn-sm" />
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', margin: '22px 0 18px' }}>
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
            <div className="val num" style={{ fontSize: 19 }}>{k.v}</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {accounts.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700 }}>Fund accounts</div>
            <span className="muted" style={{ fontSize: 12 }}>
              Membership fees &amp; welfare held by the fund — inside the {KES(total)} total, outside member counts.
            </span>
          </div>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', marginTop: 14 }}>
            {accounts.map((a) => {
              const isWelfare = String(a.member_no).toUpperCase().includes('WELFARE');
              const meta = isWelfare
                ? { icon: 'fa-hand-holding-heart', color: 'var(--purple2)', sub: 'Welfare fund' }
                : { icon: 'fa-hand-holding-dollar', color: 'var(--lime2)', sub: 'Membership fees' };
              return (
                <div
                  key={a.member_no}
                  style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 14, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)' }}
                >
                  <span style={{ flex: 'none', width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: meta.color }}>
                    <i className={`fa-solid ${meta.icon}`} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{a.full_name || meta.sub}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{meta.sub} · {a.member_no}</div>
                  </div>
                  <div className="num" style={{ fontWeight: 800, fontSize: 16 }}>{KES(n(a.current_balance))}</div>
                </div>
              );
            })}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Combined {KES(accountsTotal)} across {accounts.length} fund account{accounts.length === 1 ? '' : 's'}. Included in the fund total; excluded from member counts, dropdowns and exit logic.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <div className="section-title">Fund position</div>
              <div className="section-sub">KES millions · Dec 2025 &rarr; Jul 2026 (interpolated between the two stored endpoints)</div>
            </div>
          </div>
          <AreaChart data={ramp} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <span className="badge badge-purple">Opening {KES(opening)}</span>
            <span className="badge badge-lime">Current {KES(total)}</span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Opening {KES(opening)} + contributions {KES(contributions)} + interest {KES(interest)} = {KES(total)}.
          </div>
        </div>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <div className="section-title">Money distribution</div>
              <div className="section-sub">Where the fund total comes from</div>
            </div>
          </div>
          {segments.length ? (
            <Donut segments={segments} />
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>No fund data loaded yet.</div>
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-head">
          <div>
            <div className="section-title">Distribution breakdown</div>
            <div className="section-sub">Every shilling of the fund by origin — reconciles to the fund total.</div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr className="muted" style={{ textAlign: 'left', fontSize: 11.5 }}>
                <th style={{ padding: '8px 10px' }}>Component</th>
                <th style={{ padding: '8px 10px', minWidth: 150 }}>Share</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount (KES)</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {dist.map((d) => {
                const share = total ? (d.value / total) * 100 : 0;
                return (
                  <tr key={d.label} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 10px' }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: d.color, marginRight: 8 }} />
                      {d.label}
                    </td>
                    <td style={{ padding: '11px 10px' }}>
                      <div style={{ height: 8, borderRadius: 99, background: 'var(--surface2)', overflow: 'hidden', minWidth: 80 }}>
                        <div style={{ width: `${share}%`, height: '100%', borderRadius: 99, background: d.color }} />
                      </div>
                    </td>
                    <td style={{ padding: '11px 10px', textAlign: 'right' }} className="num">{KES(d.value)}</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right' }} className="num muted">{share.toFixed(1)}%</td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '11px 10px' }}>Total fund</td>
                <td />
                <td style={{ padding: '11px 10px', textAlign: 'right' }} className="num">{KES(total)}</td>
                <td style={{ padding: '11px 10px', textAlign: 'right' }} className="num">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-head">
          <div>
            <div className="section-title">Interest by partner</div>
            <div className="section-sub">How the {KES(interest)} of interest was earned across insurers and prior years.</div>
          </div>
          <span className="badge badge-info">Total interest {KES(interest)}</span>
        </div>
        {interestParts.length ? (
          <>
            <div className="compbar">
              {interestParts.map((p) => (
                <span key={p.label} style={{ width: (interest ? (p.value / interest) * 100 : 0) + '%', background: p.color }} />
              ))}
            </div>
            <div className="complegend">
              {interestParts.map((p) => (
                <div key={p.label} className="compitem">
                  <div className="row"><span className="dotc" style={{ background: p.color }} /> {p.label}</div>
                  <div className="amt num">{KES(p.value)}</div>
                  <div className="shr">{interest ? Math.round((p.value / interest) * 100) : 0}% of interest · {p.sub}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="muted" style={{ fontSize: 12 }}>
            Partner interest (Britam / Jubilee) posts here once the insurer statements are loaded.
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-head">
          <div>
            <div className="section-title">Member exits &amp; refunds</div>
            <div className="section-sub">Exited members remain in the audit trail but drop out of active reporting.</div>
          </div>
        </div>
        <div className="metricgrid">
          <div className="stat">
            <div className="stat-top"><span className="stat-lbl">Active</span><span className="stat-ic" style={{ background: 'var(--surface2)', color: 'var(--good)' }}><i className="fa-solid fa-circle-check" /></span></div>
            <div className="stat-val num">{active}</div>
            <div className="stat-sub">Staying in the fund</div>
          </div>
          <div className="stat">
            <div className="stat-top"><span className="stat-lbl">Exiting</span><span className="stat-ic" style={{ background: 'var(--surface2)', color: 'var(--warn)' }}><i className="fa-solid fa-right-from-bracket" /></span></div>
            <div className="stat-val num">{exiting}</div>
            <div className="stat-sub">Refund in process</div>
          </div>
          <div className="stat">
            <div className="stat-top"><span className="stat-lbl">Exited</span><span className="stat-ic" style={{ background: 'var(--surface2)', color: 'var(--bad)' }}><i className="fa-solid fa-user-slash" /></span></div>
            <div className="stat-val num">{exited}</div>
            <div className="stat-sub">Left the fund</div>
          </div>
          <div className="stat">
            <div className="stat-top"><span className="stat-lbl">Refunds on exit</span><span className="stat-ic" style={{ background: 'var(--surface2)', color: 'var(--lime2)' }}><i className="fa-solid fa-money-bill-transfer" /></span></div>
            <div className="stat-val num">{KES(withdrawals)}</div>
            <div className="stat-sub">Paid out to exits</div>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          {exited + exiting === 0
            ? 'No members are currently exiting or exited — the full register is active.'
            : `Total excluding exits is ${KES(totalExclExits)}.`}
        </div>
      </div>

      <div className="muted" style={{ fontSize: 11, marginTop: 14 }}>Generated {generatedAt} · AWIVEST fund report</div>

      <style
        dangerouslySetInnerHTML={{
          __html:
            '@media print{.rpt,.rpt *{color:#1a1220 !important}.rpt .muted,.rpt .muted2{color:#555 !important}.rpt .card,.rpt .stat{background:#fff !important;border-color:#e2e2e2 !important;box-shadow:none !important}.rpt .badge{border-color:#cfcfcf !important}.rpt .compbar,.rpt .compbar>span,.rpt .dotc{-webkit-print-color-adjust:exact;print-color-adjust:exact}}',
        }}
      />
    </div>
  );
}
