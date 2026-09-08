import { createClient } from '@/lib/supabase/server';
import { KES } from '@/lib/format';
import AreaChart from '@/components/AreaChart';
import Donut, { Segment } from '@/components/Donut';

export const dynamic = 'force-dynamic';

// Illustrative allocation across the collective + partner instruments, scaled to
// the member's real current balance. A live holdings feed replaces this in a
// later phase (hence the Preview marker) — mirrors the prototype's Portfolio.
const ALLOC = [
  { key: 'Collective', label: 'AWIVEST Pooled Fund (core)', cat: 'Collective', w: 0.55, color: '#a6cd35' },
  { key: 'Money Market', label: 'Britam Money Market Fund', cat: 'Money Market', w: 0.2, color: '#7e2674' },
  { key: 'Property', label: 'Land banking — Kajiado / Nakuru', cat: 'Property', w: 0.15, color: '#a6398f' },
  { key: 'Equities', label: 'NSE blue-chip basket', cat: 'Equities', w: 0.1, color: '#5aa9f0' },
];

export default async function PortfolioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  const [{ data: finRows }, { data: holdings }] = await Promise.all([
    supabase.from('member_finances').select('current_balance').eq('member_id', uid).limit(1),
    supabase.from('holdings').select('*').eq('member_id', uid),
  ]);
  const holds = (holdings ?? []) as any[];
  const liveTotal = holds.reduce((s, h) => s + Number(h.value || 0), 0);
  const total = liveTotal || Number(((finRows ?? []) as any[])[0]?.current_balance || 0);

  const rows = ALLOC.map((a) => ({ ...a, amt: Math.round(total * a.w) }));
  const segments: Segment[] = ALLOC.map((a) => ({ label: a.key, value: Math.round(a.w * 100), color: a.color }));
  const trend = [100, 101, 103, 104, 106, 108, 110, 113].map((f) => Math.round((total * f) / 100 / 1000));

  return (
    <div>
      <div className="page-title">Investment Portfolio</div>
      <div className="sub">
        Your holdings breakdown across the collective and partner instruments.{' '}
        <span className="badge badge-purple">Preview</span> a live holdings feed connects in a later phase.
      </div>

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                <th style={{ padding: '8px 10px' }}>Instrument</th>
                <th style={{ padding: '8px 10px' }}>Value</th>
                <th style={{ padding: '8px 10px' }}>Weight</th>
                <th style={{ padding: '8px 10px' }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.key} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px' }}>
                    <div style={{ fontWeight: 600 }}>{h.label}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{h.cat}</div>
                  </td>
                  <td style={{ padding: '10px' }} className="num">{KES(h.amt)}</td>
                  <td style={{ padding: '10px' }} className="num">{Math.round(h.w * 100)}%</td>
                  <td style={{ padding: '10px', width: 140 }}>
                    <div className="bar" style={{ width: 120 }}><span style={{ width: `${h.w * 100}%` }} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ padding: '12px 10px', fontWeight: 700, borderTop: '1px solid var(--border)' }}>Total</td>
                <td style={{ padding: '12px 10px', fontWeight: 800, borderTop: '1px solid var(--border)' }} className="num">{KES(total)}</td>
                <td colSpan={2} style={{ borderTop: '1px solid var(--border)' }} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', marginTop: 16 }}>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Allocation</div>
          <Donut segments={segments} />
        </div>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Performance snapshot</div>
          <AreaChart data={trend} />
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Indexed to opening balance. Illustrative.</div>
        </div>
      </div>
    </div>
  );
}
