import { createClient } from '@/lib/supabase/server';
import { KES } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DividendsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  const { data: divRows } = await supabase
    .from('dividends')
    .select('*')
    .eq('member_id', uid)
    .order('declared_at', { ascending: false });
  const divs = (divRows ?? []) as any[];
  const paid = divs.filter((d) => d.status === 'paid').reduce((s, d) => s + Number(d.amount || 0), 0);
  const declared = divs.filter((d) => d.status === 'declared').reduce((s, d) => s + Number(d.amount || 0), 0);
  const all = divs.reduce((s, d) => s + Number(d.amount || 0), 0);

  return (
    <div>
      <div className="page-title">Dividends</div>
      <div className="sub">Dividends and interim payouts recorded for you.</div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', margin: '20px 0 16px' }}>
        <div className="card kpi"><div className="lbl">Total paid to date</div><div className="val num">{KES(paid)}</div></div>
        <div className="card kpi"><div className="lbl">Declared (pending)</div><div className="val num">{KES(declared)}</div></div>
        <div className="card kpi"><div className="lbl">All-time recorded</div><div className="val num">{KES(all)}</div></div>
      </div>

      <div className="card card-pad">
        {divs.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No dividends recorded yet. Declared and paid dividends will appear here.</div>
        ) : (
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
                    <td style={{ padding: '10px' }} className="num">{KES(Number(d.amount))}</td>
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
        )}
      </div>
    </div>
  );
}
