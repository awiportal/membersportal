import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { KES, KESc } from '@/lib/format';
import AreaChart from '@/components/AreaChart';
import Donut, { Segment } from '@/components/Donut';

export const dynamic = 'force-dynamic';

const n = (v: any) => Number(v || 0);

// Investment Portfolio — the member's REAL position in the AWIVEST fund, read
// live from member_finances (same source as their statement and the staff
// views). No illustrative allocation: the balance is broken into how it was
// actually built (principal + interest) and where the interest came from.
export default async function PortfolioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  const { data: finRows } = await supabase.from('member_finances').select('*').eq('member_id', uid).limit(1);
  const fin = ((finRows ?? []) as any[])[0];

  if (!fin) {
    return (
      <div>
        <div className="page-title">Investment Portfolio</div>
        <div className="sub">Your position in the AWIVEST fund.</div>
        <div className="card card-pad" style={{ marginTop: 20 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Your portfolio appears here once your login is linked to your AWIVEST register record. Ask the office to link your member number.
          </div>
        </div>
      </div>
    );
  }

  const opening = n(fin.opening_balance_2025);
  const c2026 = n(fin.contributions_2026);
  const lifetime = n(fin.lifetime_contributions) || opening + c2026;
  const interest = n(fin.total_interest_2026);
  const current = n(fin.current_balance);
  const asOf = fin.as_of
    ? new Date(fin.as_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  const comp = [
    { label: 'Contributions to 2025', value: opening, color: '#7e2674' },
    { label: '2026 contributions', value: c2026, color: '#a6cd35' },
    { label: 'Interest earned', value: interest, color: '#5aa9f0' },
  ].filter((x) => x.value > 0);
  const compSegments: Segment[] = comp.map((x) => ({ label: x.label, value: x.value, color: x.color }));

  const sources = [
    { label: 'Interest 2018-2023', value: n(fin.interest_2018_2023), color: '#a6398f' },
    { label: 'Britam Money Market', value: n(fin.britam_interest_life) || n(fin.britam_interest_2026), color: '#7e2674' },
    { label: 'Jubilee MMF', value: n(fin.jubilee_mmf) || n(fin.jubilee_interest_2026), color: '#5aa9f0' },
    { label: 'Jubilee FIF', value: n(fin.jubilee_fif), color: '#37c98a' },
    { label: 'Jubilee FIF (Apr-Jul 2026)', value: n(fin.jubilee_fif_apr_jul), color: '#f2b23b' },
  ].filter((x) => x.value > 0);

  const months = 8;
  const trend = Array.from({ length: months }, (_, i) =>
    Math.round((opening + ((current - opening) * i) / (months - 1)) / 1000)
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">Investment Portfolio</div>
          <div className="sub">
            Your real position in the AWIVEST fund{asOf ? ', as at ' + asOf : ''}. <span className="badge badge-good">Live</span>
          </div>
        </div>
        <Link href="/statements" className="btn btn-ghost btn-sm"><i className="fa-solid fa-file-invoice-dollar" /> View full statement</Link>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))', margin: '22px 0 16px' }}>
        <div className="card kpi hover-lift">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="lbl">Current balance</span>
            <span className="ic grad-purple" style={{ color: '#fff' }}><i className="fa-solid fa-wallet" /></span>
          </div>
          <div className="val num">{KESc(current)}</div>
        </div>
        <div className="card kpi hover-lift">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="lbl">Principal contributed</span>
            <span className="ic" style={{ background: 'var(--surface2)' }}><i className="fa-solid fa-piggy-bank" style={{ color: 'var(--lime2)' }} /></span>
          </div>
          <div className="val num">{KESc(lifetime)}</div>
        </div>
        <div className="card kpi hover-lift">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="lbl">Interest earned</span>
            <span className="ic grad-lime" style={{ color: '#20260a' }}><i className="fa-solid fa-chart-line" /></span>
          </div>
          <div className="val num">{KESc(interest)}</div>
        </div>
      </div>

      <div className="card card-pad">
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Balance composition</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>How your current balance is made up — these sum to your total.</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                <th style={{ padding: '8px 10px' }}>Component</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Share</th>
                <th style={{ padding: '8px 10px' }} />
              </tr>
            </thead>
            <tbody>
              {comp.map((x) => {
                const share = current ? Math.round((x.value / current) * 100) : 0;
                return (
                  <tr key={x.label} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px' }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: x.color, marginRight: 8 }} />
                      {x.label}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }} className="num">{KES(x.value)}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }} className="num muted">{share}%</td>
                    <td style={{ padding: '10px', width: 140 }}>
                      <div className="bar" style={{ width: 120 }}><span style={{ width: String(share) + '%' }} /></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 800 }}>
                <td style={{ padding: '12px 10px', borderTop: '2px solid var(--border)' }}>Current balance</td>
                <td style={{ padding: '12px 10px', textAlign: 'right', borderTop: '2px solid var(--border)' }} className="num">{KES(current)}</td>
                <td colSpan={2} style={{ borderTop: '2px solid var(--border)' }} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', marginTop: 16 }}>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Composition</div>
          {compSegments.length ? <Donut segments={compSegments} /> : <div className="muted" style={{ fontSize: 13 }}>No balance recorded yet.</div>}
        </div>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Growth (KES thousands)</div>
          <AreaChart data={trend} />
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Interpolated between opening balance (Dec 2025) and current balance{asOf ? ' (' + asOf + ')' : ''}. Monthly NAV history arrives with statements.
          </div>
        </div>
      </div>

      {sources.length > 0 && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Where your returns come from</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Interest credited to your balance by the fund&apos;s partner instruments.</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                  <th style={{ padding: '8px 10px' }}>Instrument</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Interest (KES)</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((x) => (
                  <tr key={x.label} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px' }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: x.color, marginRight: 8 }} />
                      {x.label}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }} className="num">{KES(x.value)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 800, borderTop: '2px solid var(--border)' }}>
                  <td style={{ padding: '10px' }}>Total interest earned</td>
                  <td style={{ padding: '10px', textAlign: 'right' }} className="num">{KES(interest)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
