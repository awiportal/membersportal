import { createClient } from '@/lib/supabase/server';
import { KES } from '@/lib/format';

export const dynamic = 'force-dynamic';

const METHOD_LABEL: Record<string, string> = { mpesa: 'M-Pesa', card: 'Card', bank: 'Bank' };

function StatusBadge({ s }: { s?: string }) {
  const cls =
    s === 'confirmed' ? 'badge-good' : s === 'pending' ? 'badge-warn' : s === 'reversed' ? 'badge-purple' : 'badge-bad';
  const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default async function PaymentsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  const [{ data: profile }, { data: finRows }, { data: contribs }] = await Promise.all([
    supabase.from('profiles').select('phone').eq('id', uid).single(),
    supabase.from('member_finances').select('contributions_2026, annual_goal').eq('member_id', uid).limit(1),
    supabase.from('contributions').select('*').eq('member_id', uid).order('created_at', { ascending: false }),
  ]);
  const fin = ((finRows ?? []) as any[])[0];
  const hist = (contribs ?? []) as any[];
  const contrib2026 = Number(fin?.contributions_2026 || 0);
  // Default annual goal (KES 300,000) when a member hasn't set one — matches Contributions.
  const goal = Number(fin?.annual_goal) > 0 ? Number(fin?.annual_goal) : 300000;
  const goalPct = Math.min(100, Math.round((contrib2026 / goal) * 100));

  return (
    <div>
      <div className="page-title">Payments</div>
      <div className="sub">
        Contribute via M-Pesa STK push, card or bank, and track your contribution history.{' '}
        <span className="badge badge-purple">Preview</span> live M-Pesa (Daraja) connects once credentials are set.
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', marginTop: 20 }}>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Make a contribution</div>
          <div className="field">
            <label>Amount (KES)</label>
            <input className="input" defaultValue="25000" />
          </div>
          <div className="field">
            <label>M-Pesa phone number</label>
            <input className="input" defaultValue={profile?.phone || ''} />
          </div>
          <button className="btn btn-lime" style={{ width: '100%', justifyContent: 'center' }} type="button" disabled>
            <i className="fa-solid fa-mobile-screen-button" /> Send M-Pesa STK push
          </button>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Live payments connect once Daraja credentials are configured in Settings.
          </div>
        </div>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>This year</div>
          <div className="muted" style={{ fontSize: 12 }}>2026 contributions</div>
          <div className="num" style={{ fontSize: 26, fontWeight: 800 }}>{KES(contrib2026)}</div>
          <div className="bar" style={{ marginTop: 12 }}><span style={{ width: `${goalPct}%` }} /></div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            {`${goalPct}% toward your ${KES(goal)} annual goal.`}
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Contribution history</div>
        {hist.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No contributions recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                  <th style={{ padding: '8px 10px' }}>Date</th>
                  <th style={{ padding: '8px 10px' }}>Method</th>
                  <th style={{ padding: '8px 10px' }}>Reference</th>
                  <th style={{ padding: '8px 10px' }}>Amount</th>
                  <th style={{ padding: '8px 10px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {hist.map((h) => (
                  <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px' }} className="num">{h.created_at ? new Date(h.created_at).toLocaleDateString('en-GB') : '—'}</td>
                    <td style={{ padding: '10px' }}>{METHOD_LABEL[h.method] || h.method}</td>
                    <td style={{ padding: '10px' }} className="num muted">{h.provider_ref || '—'}</td>
                    <td style={{ padding: '10px' }} className="num">{KES(Number(h.amount))}</td>
                    <td style={{ padding: '10px' }}><StatusBadge s={h.status} /></td>
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
