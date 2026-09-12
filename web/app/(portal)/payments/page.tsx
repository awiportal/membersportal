import { createClient } from '@/lib/supabase/server';
import { KES } from '@/lib/format';

export const dynamic = 'force-dynamic';

const METHOD_LABEL: Record<string, string> = { mpesa: 'M-Pesa', card: 'Card', bank: 'Bank' };

const MONTHS: [string, string][] = [
  ['jan', 'Jan'], ['feb', 'Feb'], ['mar', 'Mar'], ['apr', 'Apr'], ['may', 'May'], ['jun', 'Jun'],
  ['jul', 'Jul'], ['aug', 'Aug'], ['sep', 'Sep'], ['oct', 'Oct'], ['nov', 'Nov'], ['dec', 'Dec'],
];
const MONTH_NUM: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const n = (v: any) => {
  const x = Number(v);
  return isFinite(x) ? x : 0;
};

function StatusBadge({ s }: { s?: string }) {
  const cls =
    s === 'confirmed' ? 'badge-good' : s === 'pending' ? 'badge-warn' : s === 'reversed' ? 'badge-purple' : 'badge-bad';
  const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : '\u2014';
  return <span className={`badge ${cls}`}>{label}</span>;
}

type HistRow = {
  key: string;
  ts: number;
  dateLabel: string;
  method: string;
  reference: string;
  amount: number;
  status: string;
};

export default async function PaymentsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  const [{ data: profile }, { data: finRows }, { data: contribs }] = await Promise.all([
    supabase.from('profiles').select('phone').eq('id', uid).single(),
    supabase
      .from('member_finances')
      .select('contributions_2026, annual_goal, sched_2026, opening_balance_2025, lifetime_contributions')
      .eq('member_id', uid)
      .limit(1),
    supabase.from('contributions').select('*').eq('member_id', uid).order('created_at', { ascending: false }),
  ]);
  const fin = ((finRows ?? []) as any[])[0];
  const ledger = (contribs ?? []) as any[];
  const contrib2026 = Number(fin?.contributions_2026 || 0);
  // Default annual goal (KES 300,000) when a member hasn't set one — matches Contributions.
  const goal = Number(fin?.annual_goal) > 0 ? Number(fin?.annual_goal) : 300000;
  const goalPct = Math.min(100, Math.round((contrib2026 / goal) * 100));

  // Contribution history is derived from the authoritative fund record — the 2026
  // monthly schedule plus the pre-2026 principal brought forward — and then merged
  // with any live portal payments (the contributions ledger). This is why the
  // history now shows what the member already sees in their balance, instead of an
  // empty ledger reading "No contributions recorded yet".
  const rows: HistRow[] = [];

  const sched = fin?.sched_2026 && typeof fin.sched_2026 === 'object' ? fin.sched_2026 : null;
  if (sched) {
    for (const [k, lbl] of MONTHS) {
      const amt = n(sched[k]);
      if (amt > 0) {
        rows.push({
          key: 'sch-' + k,
          ts: new Date(2026, MONTH_NUM[k], 1).getTime(),
          dateLabel: lbl + ' 2026',
          method: 'Contribution',
          reference: '2026 schedule',
          amount: amt,
          status: 'confirmed',
        });
      }
    }
  }

  const opening = n(fin?.opening_balance_2025);
  if (opening > 0) {
    rows.push({
      key: 'brought-forward',
      ts: new Date(2025, 11, 31).getTime(),
      dateLabel: 'To 31 Dec 2025',
      method: 'Brought forward',
      reference: 'Contributions before 2026',
      amount: opening,
      status: 'confirmed',
    });
  }

  // Merge any live portal payments (M-Pesa / card / bank) recorded in the ledger.
  for (const h of ledger) {
    rows.push({
      key: 'ledger-' + h.id,
      ts: h.created_at ? new Date(h.created_at).getTime() : Date.now(),
      dateLabel: h.created_at ? new Date(h.created_at).toLocaleDateString('en-GB') : '\u2014',
      method: METHOD_LABEL[h.method] || h.method || '\u2014',
      reference: h.provider_ref || '\u2014',
      amount: n(h.amount),
      status: h.status || 'pending',
    });
  }

  rows.sort((a, b) => b.ts - a.ts);
  const confirmedTotal = rows.filter((r) => r.status === 'confirmed').reduce((s, r) => s + r.amount, 0);

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>Contribution history</div>
          {rows.length > 0 && (
            <div className="muted" style={{ fontSize: 12 }}>
              Total contributed <span className="num" style={{ fontWeight: 700, color: 'var(--text)' }}>{KES(confirmedTotal)}</span>
            </div>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No contributions recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                  <th style={{ padding: '8px 10px' }}>Date</th>
                  <th style={{ padding: '8px 10px' }}>Type</th>
                  <th style={{ padding: '8px 10px' }}>Reference</th>
                  <th style={{ padding: '8px 10px' }}>Amount</th>
                  <th style={{ padding: '8px 10px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px' }} className="num">{r.dateLabel}</td>
                    <td style={{ padding: '10px' }}>{r.method}</td>
                    <td style={{ padding: '10px' }} className="num muted">{r.reference}</td>
                    <td style={{ padding: '10px' }} className="num">{KES(r.amount)}</td>
                    <td style={{ padding: '10px' }}><StatusBadge s={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
              Monthly amounts are your recorded 2026 contributions; &ldquo;Brought forward&rdquo; is your total contributions before 2026. Live M-Pesa, card and bank payments will appear here once Daraja is connected.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
