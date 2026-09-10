import { createClient } from '@/lib/supabase/server';
import { KES } from '@/lib/format';

export const dynamic = 'force-dynamic';

const n = (v: any) => Number(v || 0);

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

  // Interest the AWIVEST fund has credited to this member — their real earnings,
  // read from the register (member_finances), the same source staff statements use.
  const totalInterest = fin ? n(fin.total_interest_2026) : 0;
  const parts: [string, number][] = fin
    ? ([
        ['Interest 2018-2023', n(fin.interest_2018_2023)],
        ['Britam interest', n(fin.britam_interest_life) || n(fin.britam_interest_2026)],
        ['Jubilee MMF interest', n(fin.jubilee_mmf) || n(fin.jubilee_interest_2026)],
        ['Jubilee FIF', n(fin.jubilee_fif)],
        ['Jubilee FIF (Apr-Jul 2026)', n(fin.jubilee_fif_apr_jul)],
      ].filter((p) => (p[1] as number) > 0) as [string, number][])
    : [];
  const asOf = fin?.as_of
    ? new Date(fin.as_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div>
      <div className="page-title">Dividends &amp; earnings</div>
      <div className="sub">Interest the AWIVEST fund has credited to you{asOf ? ` · as at ${asOf}` : ''}, plus any declared dividends.</div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', margin: '20px 0 16px' }}>
        <div className="card kpi hover-lift">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="lbl">Interest earned</span>
            <span className="ic grad-lime" style={{ color: '#20260a' }}><i className="fa-solid fa-chart-line" /></span>
          </div>
          <div className="val num">{KES(totalInterest)}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Credited to your fund balance</div>
        </div>
        <div className="card kpi hover-lift">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="lbl">Declared (pending)</span>
            <span className="ic" style={{ background: 'var(--surface2)' }}><i className="fa-solid fa-hourglass-half" style={{ color: 'var(--lime2)' }} /></span>
          </div>
          <div className="val num">{KES(declared)}</div>
        </div>
        <div className="card kpi hover-lift">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="lbl">Dividends paid</span>
            <span className="ic" style={{ background: 'var(--surface2)' }}><i className="fa-solid fa-coins" style={{ color: 'var(--lime2)' }} /></span>
          </div>
          <div className="val num">{KES(paid)}</div>
        </div>
      </div>

      <div className="card card-pad">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Interest earned breakdown</div>
        {totalInterest > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                  <th style={{ padding: '8px 10px' }}>Source</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount (KES)</th>
                </tr>
              </thead>
              <tbody>
                {parts.length > 0 ? (
                  parts.map((p) => (
                    <tr key={p[0]} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px', fontWeight: 600 }}>{p[0]}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }} className="num">{KES(p[1])}</td>
                    </tr>
                  ))
                ) : (
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px', fontWeight: 600 }}>Fund interest earned</td>
                    <td style={{ padding: '10px', textAlign: 'right' }} className="num">{KES(totalInterest)}</td>
                  </tr>
                )}
                <tr style={{ fontWeight: 800, borderTop: '2px solid var(--border)' }}>
                  <td style={{ padding: '10px' }}>Total interest earned</td>
                  <td style={{ padding: '10px', textAlign: 'right' }} className="num">{KES(totalInterest)}</td>
                </tr>
              </tbody>
            </table>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
              Interest is credited to your fund balance and compounds inside AWIVEST. See your full <strong>Statement</strong> for the complete position, or your <strong>Contributions</strong> for the running total.
            </div>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>
            Your interest earnings appear here once your login is linked to your AWIVEST register record.
          </div>
        )}
      </div>

      {divs.length > 0 && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Declared &amp; paid dividends</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                  <th style={{ padding: '8px 10px' }}>Source / period</th>
                  <th style={{ padding: '8px 10px' }}>Amount</th>
                  <th style={{ padding: '8px 10px' }}>Status</th>
                  <th style={{ padding: '8px 10px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {divs.map((d) => (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px', fontWeight: 600 }}>{d.source}{d.period ? ` · ${d.period}` : ''}</td>
                    <td style={{ padding: '10px' }} className="num">{KES(n(d.amount))}</td>
                    <td style={{ padding: '10px' }}>
                      <span className={`badge ${d.status === 'paid' ? 'badge-good' : 'badge-warn'}`}>{d.status === 'paid' ? 'Paid' : 'Declared'}</span>
                    </td>
                    <td style={{ padding: '10px' }} className="muted num">
                      {d.paid_at || d.declared_at ? new Date(d.paid_at || d.declared_at).toLocaleDateString('en-GB') : '—'}
                    </td>
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
