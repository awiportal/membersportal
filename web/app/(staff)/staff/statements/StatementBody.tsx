const MONTHS: [string, string][] = [
  ['jan', 'Jan'], ['feb', 'Feb'], ['mar', 'Mar'], ['apr', 'Apr'], ['may', 'May'], ['jun', 'Jun'],
  ['jul', 'Jul'], ['aug', 'Aug'], ['sep', 'Sep'], ['oct', 'Oct'], ['nov', 'Nov'], ['dec', 'Dec'],
];

const num = (v: any): number | null =>
  v == null || v === '' || isNaN(Number(v)) ? null : Number(v);
const kes = (v: any) =>
  num(v) == null ? '—' : 'KES ' + Math.round(Number(v)).toLocaleString('en-KE');

// Pure statement card (the printable sheet). Shared by the full-page
// StatementView and the slide-over drawer in the staff statements browser.
export default function StatementBody({ fin }: { fin: any }) {
  const opening = num(fin.opening_balance_2025);
  const c2026 = num(fin.contributions_2026);
  const sched: Record<string, any> | null =
    fin.sched_2026 && typeof fin.sched_2026 === 'object' ? fin.sched_2026 : null;
  const schedTotal = sched ? MONTHS.reduce((s, m) => s + (num(sched[m[0]]) ?? 0), 0) : (c2026 ?? 0);
  const lifetime = num(fin.lifetime_contributions) ?? ((opening ?? 0) + (c2026 ?? 0));
  const totalInterest = num(fin.total_interest_2026);
  const current = num(fin.current_balance);
  const net = num(fin.net_balance);
  const withdrawal = num(fin.withdrawal);
  const refundExit = num(fin.refund_on_exit);
  const isExiting = fin.status === 'exiting' || !!fin.refund_status;
  const asOf = fin.as_of
    ? new Date(fin.as_of).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  const interestParts: [string, number | null][] = [
    ['Interest 2018-2023', num(fin.interest_2018_2023)],
    ['Britam Interest', num(fin.britam_interest_life) ?? num(fin.britam_interest_2026)],
    ['Jubilee MMF Interest', num(fin.jubilee_mmf) ?? num(fin.jubilee_interest_2026)],
    ['Jubilee FIF', num(fin.jubilee_fif)],
    ['Jubilee FIF (Apr-Jul 2026)', num(fin.jubilee_fif_apr_jul)],
  ];
  const shownParts = interestParts.filter((p) => p[1] != null);

  const statusCls = fin.status === 'active' ? 'badge-good' : fin.status === 'exiting' ? 'badge-warn' : 'badge-info';

  const Row = ({ k, v, strong, neg }: { k: string; v: string; strong?: boolean; neg?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted" style={{ fontSize: 13.5 }}>{k}</span>
      <span style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? 16 : 13.5, color: neg ? 'var(--bad)' : undefined }}>{v}</span>
    </div>
  );

  return (
    <div className="card card-pad print-sheet">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '.14em', color: 'var(--muted2)' }}>AWIVEST LTD</div>
          <div className="page-title" style={{ marginTop: 4 }}>{fin.full_name}</div>
          <div className="sub">{fin.member_no}{asOf ? ' · statement as at ' + asOf : ''} · all amounts in KES</div>
        </div>
        <span className={'badge ' + statusCls}>{fin.status === 'exiting' ? 'Exiting' : fin.status === 'active' ? 'Active' : (fin.status || 'Member')}</span>
      </div>

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Balance</div>
          <Row k="Opening balance (31 Dec 2025)" v={kes(opening)} />
          <Row k="Contributions (2026 YTD)" v={kes(schedTotal)} />
          <Row k="Total interest" v={kes(totalInterest)} />
          {withdrawal != null && withdrawal > 0 && <Row k="Withdrawals" v={'- ' + kes(withdrawal)} neg />}
          {isExiting && refundExit != null && <Row k="Refund on exit" v={kes(refundExit)} />}
          <Row k="TOTAL" v={kes(current)} strong />
          {net != null && net !== current && <Row k="Net balance in fund" v={kes(net)} />}
          <div style={{ marginTop: 14, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Contributions</div>
          <Row k="Before 2026 (principal to 31 Dec 2025)" v={kes(opening)} />
          <Row k="Contributions in 2026" v={kes(schedTotal)} />
          <Row k="Lifetime contributions" v={kes(lifetime)} strong />
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Interest earned</div>
          {shownParts.length > 0 ? (
            <>
              {shownParts.map((p) => (<Row key={p[0]} k={p[0]} v={kes(p[1])} />))}
              <Row k="Total interest" v={kes(totalInterest)} strong />
            </>
          ) : (
            <>
              <Row k="Britam interest" v={kes(num(fin.britam_interest_2026))} />
              <Row k="Jubilee interest" v={kes(num(fin.jubilee_interest_2026))} />
              <Row k="Total interest" v={kes(totalInterest)} strong />
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Full interest split appears once the breakdown is loaded.</div>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Monthly contributions (2026)</div>
        {sched ? (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(84px,1fr))' }}>
            {MONTHS.map((m) => {
              const v = num(sched[m[0]]);
              return (
                <div key={m[0]} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 11, padding: '8px 10px' }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>{m[1]}</div>
                  <div style={{ fontWeight: 700, fontSize: 12.5, marginTop: 2, color: v ? 'var(--text)' : 'var(--muted2)' }}>{v ? Math.round(v).toLocaleString('en-KE') : '—'}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>Monthly breakdown appears once the 2026 schedule is loaded. 2026 total: <strong>{kes(c2026)}</strong>.</div>
        )}
      </div>

      {fin.notes && (
        <div className="muted" style={{ fontSize: 12, marginTop: 16, lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <i className="fa-solid fa-circle-info" style={{ marginRight: 6 }} />{fin.notes}
        </div>
      )}
    </div>
  );
}
