import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { KES, KESc, interestTotal } from '@/lib/format';
import AreaChart from '@/components/AreaChart';
import Donut, { Segment } from '@/components/Donut';
import MoneyNav from '@/components/MoneyNav';

export const dynamic = 'force-dynamic';

const n = (v: any) => Number(v || 0);


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
        <MoneyNav />
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
  const interest = interestTotal(fin);
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
    { label: 'Britam Money Market', value: n(fin.britam_interest_life), color: '#7e2674' },
    { label: 'Jubilee MMF', value: n(fin.jubilee_mmf), color: '#5aa9f0' },
    { label: 'Jubilee FIF', value: n(fin.jubilee_fif), color: '#37c98a' },
    { label: 'Jubilee FIF (Apr-Jul 2026)', value: n(fin.jubilee_fif_apr_jul), color: '#f2b23b' },
  ].filter((x) => x.value > 0);
  const maxSource = sources.reduce((m, s) => Math.max(m, s.value), 0);

  const months = 8;
  const trend = Array.from({ length: months }, (_, i) =>
    Math.round((opening + ((current - opening) * i) / (months - 1)) / 1000)
  );

  const returnPct = lifetime > 0 ? Math.round((interest / lifetime) * 100) : 0;
  const multiple = lifetime > 0 ? current / lifetime : 0;
  const interestShare = current > 0 ? Math.round((interest / current) * 100) : 0;
  const isExiting = fin.status === 'exiting';

  return (
    <div>
      <MoneyNav />

      <section className="hero rise">
        <div className="hero-grid">
          <div>
            <div className="hero-eyebrow">Investment Portfolio{fin.member_no ? ' \u00b7 ' + fin.member_no : ''}</div>
            <div className="hero-value">
              <span className="cur">KES</span>
              {(Number(current) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="hero-line">
              Your live position in the AWIVEST fund{asOf ? ', as at ' + asOf : ''}. A principal of {KES(lifetime)} has earned{' '}
              {KES(interest)} in interest{returnPct > 0 ? ' \u2014 a ' + returnPct + '% lifetime return' : ''}.
            </div>
            <div className="hero-pills">
              <div className="hero-pill"><div className="k">Principal</div><div className="v num">{KESc(lifetime)}</div></div>
              <div className="hero-pill"><div className="k">Interest</div><div className="v num">{KESc(interest)}</div></div>
              <div className="hero-pill"><div className="k">Growth</div><div className="v num">{multiple ? multiple.toFixed(2) + 'x' : '\u2014'}</div></div>
            </div>
            <Link href="/statements" className="hero-cta"><i className="fa-solid fa-file-invoice-dollar" /> View full statement</Link>
          </div>
          <div className="hero-spark">
            <div className="hero-spark-lbl">Value growth (KES thousands)</div>
            <AreaChart data={trend} height={128} />
          </div>
        </div>
      </section>

      <div className="insightgrid rise-2" style={{ margin: '16px 0' }}>
        <div className="insight">
          <span className="ic-round"><i className="fa-solid fa-arrow-trend-up" /></span>
          <div>
            <div className="insight-t">{multiple ? multiple.toFixed(2) + 'x' : '\u2014'} your money</div>
            <div className="insight-d">Every KES 1 contributed is now worth about KES {multiple ? multiple.toFixed(2) : '\u2014'} in the fund.</div>
          </div>
        </div>
        <div className="insight">
          <span className="ic-round"><i className="fa-solid fa-percent" /></span>
          <div>
            <div className="insight-t">{interestShare}% is interest</div>
            <div className="insight-d">{KES(interest)} of your {KES(current)} balance is interest the fund earned for you.</div>
          </div>
        </div>
        <div className="insight">
          <span className="ic-round"><i className={`fa-solid ${isExiting ? 'fa-right-from-bracket' : 'fa-shield-halved'}`} /></span>
          <div>
            <div className="insight-t">{isExiting ? 'Exiting the fund' : 'Fully invested'}</div>
            <div className="insight-d">{isExiting ? 'Your refund is being processed by the office.' : 'Your full balance stays invested and keeps earning interest.'}</div>
          </div>
        </div>
      </div>

      <div className="split rise-3">
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <div className="section-title">How your balance is built</div>
              <div className="section-sub">Principal plus interest &mdash; these sum to your current balance.</div>
            </div>
          </div>
          <div className="compbar">
            {comp.map((x) => (
              <span key={x.label} style={{ width: (current ? (x.value / current) * 100 : 0) + '%', background: x.color }} />
            ))}
          </div>
          <div className="complegend">
            {comp.map((x) => (
              <div key={x.label} className="compitem">
                <div className="row"><span className="dotc" style={{ background: x.color }} /> {x.label}</div>
                <div className="amt num">{KES(x.value)}</div>
                <div className="shr num">{current ? Math.round((x.value / current) * 100) : 0}% of balance</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700 }}>Current balance</span>
            <span className="num" style={{ fontWeight: 900, fontSize: 18, color: 'var(--lime2)' }}>{KES(current)}</span>
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 12 }}>Composition</div>
          {compSegments.length ? <Donut segments={compSegments} /> : <div className="muted" style={{ fontSize: 13 }}>No balance recorded yet.</div>}
        </div>
      </div>

      {sources.length > 0 && (
        <div className="card card-pad rise-3" style={{ marginTop: 16 }}>
          <div className="section-head">
            <div>
              <div className="section-title">Where your returns come from</div>
              <div className="section-sub">Interest credited to your balance by the fund&apos;s partner instruments.</div>
            </div>
            <span className="badge badge-lime num">{KESc(interest)} total</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="ledger">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th className="r">Interest (KES)</th>
                  <th className="barcell">Share</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((x) => (
                  <tr key={x.label}>
                    <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: x.color, marginRight: 8 }} />{x.label}</td>
                    <td className="r num">{KES(x.value)}</td>
                    <td className="barcell">
                      <div className="minibar"><span style={{ width: (maxSource ? Math.max(4, Math.round((x.value / maxSource) * 100)) : 0) + '%', background: x.color }} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total interest earned</td>
                  <td className="r num">{KES(interest)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="split-even rise-4" style={{ marginTop: 16 }}>
        <Link href="/contributions" className="card card-pad hover-lift" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="ic grad-lime" style={{ color: '#20260a', width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', flexShrink: 0 }}><i className="fa-solid fa-hand-holding-dollar" /></span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontWeight: 700 }}>Track your contributions</span>
            <span className="muted" style={{ fontSize: 12.5 }}>Monthly schedule, annual goal and interest breakdown</span>
          </span>
          <i className="fa-solid fa-chevron-right muted" />
        </Link>
        <Link href="/statements" className="card card-pad hover-lift" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="ic grad-purple" style={{ color: '#fff', width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', flexShrink: 0 }}><i className="fa-solid fa-file-invoice-dollar" /></span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontWeight: 700 }}>Download your statement</span>
            <span className="muted" style={{ fontSize: 12.5 }}>The official AWIVEST statement, print or save as PDF</span>
          </span>
          <i className="fa-solid fa-chevron-right muted" />
        </Link>
      </div>
    </div>
  );
}
