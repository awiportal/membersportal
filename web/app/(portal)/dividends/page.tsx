import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { KES, KESc, interestTotal } from '@/lib/format';
import Donut, { Segment } from '@/components/Donut';
import MoneyNav from '@/components/MoneyNav';

export const dynamic = 'force-dynamic';

const n = (v: any) => Number(v || 0);
const COLORS = ['#a6398f', '#7e2674', '#5aa9f0', '#37c98a', '#f2b23b'];

export default async function DividendsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  const [{ data: divRows }, { data: finRows }] = await Promise.all([
    supabase.from('dividends').select('*').eq('member_id', uid).order('declared_at', { ascending: false }),
    supabase.from('member_finances').select('*').eq('member_id', uid).limit(1),
  ]);
  const divs = (divRows ?? []) as any[];
  const fin = ((finRows ?? []) as any[])[0];

  const paid = divs.filter((d) => d.status === 'paid').reduce((s, d) => s + n(d.amount), 0);
  const declared = divs.filter((d) => d.status === 'declared').reduce((s, d) => s + n(d.amount), 0);

  const totalInterest = fin ? interestTotal(fin) : 0;
  const parts: [string, number][] = fin
    ? ([
        ['Interest 2018-2023', n(fin.interest_2018_2023)],
        ['Britam interest', n(fin.britam_interest_life)],
        ['Jubilee MMF interest', n(fin.jubilee_mmf)],
        ['Jubilee FIF', n(fin.jubilee_fif)],
        ['Jubilee FIF (Apr-Jul 2026)', n(fin.jubilee_fif_apr_jul)],
      ].filter((p) => (p[1] as number) > 0) as [string, number][])
    : [];
  const maxPart = parts.reduce((m, p) => Math.max(m, p[1]), 0);
  const segments: Segment[] = parts.map((p, i) => ({ label: p[0], value: p[1], color: COLORS[i % COLORS.length] }));
  const topSources = [...parts].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const streamCount = Math.max(1, parts.length);
  const asOf = fin?.as_of
    ? new Date(fin.as_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div>
      <MoneyNav />

      <section className="hero rise">
        <div className="hero-grid">
          <div>
            <div className="hero-eyebrow">Dividends &amp; Earnings{fin?.member_no ? ' \u00b7 ' + fin.member_no : ''}</div>
            <div className="hero-value">
              <span className="cur">KES</span>
              {(Number(totalInterest) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="hero-line">
              Interest the AWIVEST fund has credited to you{asOf ? ', as at ' + asOf : ''}. It compounds inside your balance rather than being paid out{declared > 0 ? `, and ${KES(declared)} in declared dividends is pending` : ''}.
            </div>
            <div className="hero-pills">
              <div className="hero-pill"><div className="k">Interest earned</div><div className="v num">{KESc(totalInterest)}</div></div>
              <div className="hero-pill"><div className="k">Declared</div><div className="v num">{KESc(declared)}</div></div>
              <div className="hero-pill"><div className="k">Paid out</div><div className="v num">{KESc(paid)}</div></div>
            </div>
            <Link href="/statements" className="hero-cta"><i className="fa-solid fa-file-invoice-dollar" /> View full statement</Link>
          </div>
          <div className="hero-spark">
            <div className="hero-spark-lbl">Top interest sources</div>
            {topSources.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {topSources.map((p, i) => (
                  <div key={p[0]} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flex: '0 0 auto' }} />
                    <span style={{ flex: 1, fontSize: 12.5, color: 'rgba(255,255,255,0.86)' }}>{p[0]}</span>
                    <span className="num" style={{ fontWeight: 800, fontSize: 13.5 }}>{KESc(p[1])}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>Your interest sources appear here once your register record is linked.</div>
            )}
          </div>
        </div>
      </section>

      <div className="insightgrid rise-2" style={{ margin: '16px 0' }}>
        <div className="insight">
          <span className="ic-round"><i className="fa-solid fa-arrows-rotate" /></span>
          <div>
            <div className="insight-t">It compounds</div>
            <div className="insight-d">Interest is credited to your fund balance and keeps earning, rather than being paid out.</div>
          </div>
        </div>
        <div className="insight">
          <span className="ic-round"><i className="fa-solid fa-layer-group" /></span>
          <div>
            <div className="insight-t">{streamCount} income {streamCount === 1 ? 'stream' : 'streams'}</div>
            <div className="insight-d">Your earnings come from Britam, Jubilee MMF &amp; FIF and prior-year interest.</div>
          </div>
        </div>
        <div className="insight">
          <span className="ic-round"><i className={`fa-solid ${paid > 0 ? 'fa-hand-holding-dollar' : 'fa-hourglass-half'}`} /></span>
          <div>
            <div className="insight-t">{paid > 0 ? KES(paid) + ' paid out' : declared > 0 ? KES(declared) + ' declared' : 'Reinvested for growth'}</div>
            <div className="insight-d">{paid > 0 ? 'Cash dividends already paid to you.' : declared > 0 ? 'Declared dividends awaiting payment.' : 'AWIVEST reinvests earnings to grow your balance.'}</div>
          </div>
        </div>
      </div>

      <div className="split rise-3">
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <div className="section-title">Interest earned breakdown</div>
              <div className="section-sub">Every source of interest the fund has credited to you.</div>
            </div>
            {totalInterest > 0 && <span className="badge badge-lime num">{KESc(totalInterest)} total</span>}
          </div>
          {totalInterest > 0 ? (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th className="r">Amount (KES)</th>
                      <th className="barcell">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.length > 0 ? (
                      parts.map((p, i) => (
                        <tr key={p[0]}>
                          <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], marginRight: 8 }} />{p[0]}</td>
                          <td className="r num">{KES(p[1])}</td>
                          <td className="barcell"><div className="minibar"><span style={{ width: (maxPart ? Math.max(4, Math.round((p[1] / maxPart) * 100)) : 0) + '%', background: COLORS[i % COLORS.length] }} /></div></td>
                        </tr>
                      ))
                    ) : (
                      <tr><td>Fund interest earned</td><td className="r num">{KES(totalInterest)}</td><td /></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr><td>Total interest earned</td><td className="r num">{KES(totalInterest)}</td><td /></tr>
                  </tfoot>
                </table>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.6 }}>
                Interest compounds inside AWIVEST. See your full{' '}
                <Link href="/statements" style={{ color: 'var(--lime2)', fontWeight: 600 }}>Statement</Link> for the complete position, or{' '}
                <Link href="/contributions" style={{ color: 'var(--lime2)', fontWeight: 600 }}>Contributions</Link> for the running total.
              </div>
            </>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>Your interest earnings appear here once your login is linked to your AWIVEST register record.</div>
          )}
        </div>

        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 12 }}>Income mix</div>
          {segments.length > 0 ? <Donut segments={segments} /> : <div className="muted" style={{ fontSize: 13 }}>No interest recorded yet.</div>}
        </div>
      </div>

      {divs.length > 0 && (
        <div className="card card-pad rise-3" style={{ marginTop: 16 }}>
          <div className="section-head">
            <div>
              <div className="section-title">Declared &amp; paid dividends</div>
              <div className="section-sub">Cash dividends declared or paid to you.</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="ledger">
              <thead>
                <tr>
                  <th>Source / period</th>
                  <th className="r">Amount</th>
                  <th>Status</th>
                  <th className="r">Date</th>
                </tr>
              </thead>
              <tbody>
                {divs.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.source}{d.period ? ' \u00b7 ' + d.period : ''}</td>
                    <td className="r num">{KES(n(d.amount))}</td>
                    <td><span className={`badge ${d.status === 'paid' ? 'badge-good' : 'badge-warn'}`}>{d.status === 'paid' ? 'Paid' : 'Declared'}</span></td>
                    <td className="r muted num">{d.paid_at || d.declared_at ? new Date(d.paid_at || d.declared_at).toLocaleDateString('en-GB') : '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
