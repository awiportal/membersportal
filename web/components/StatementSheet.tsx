import { interestTotal } from '@/lib/format';
// Shared, print-ready investment statement sheet.
//
// Single source of truth for the printable statement across every surface:
//  - the member self-service statement  (portal/statements)
//  - the staff full-page statement      (staff/statements/[member_no])
//  - the staff slide-over drawer        (staff/statements browser)
// so the member always sees exactly what staff see, laid out as a proper,
// professional statement (letterhead, summary band, ledger, footer).
//
// Pure presentational component (no hooks) so it renders on the server and
// inside client components alike. The interactive "Download PDF" chrome and
// the personalised print filename live in the callers.

const MONTHS: [string, string][] = [
  ['jan', 'Jan'], ['feb', 'Feb'], ['mar', 'Mar'], ['apr', 'Apr'], ['may', 'May'], ['jun', 'Jun'],
  ['jul', 'Jul'], ['aug', 'Aug'], ['sep', 'Sep'], ['oct', 'Oct'], ['nov', 'Nov'], ['dec', 'Dec'],
];

const num = (v: any): number | null =>
  v == null || v === '' || isNaN(Number(v)) ? null : Number(v);
const kes = (v: any) =>
  num(v) == null ? '\u2014' : 'KES ' + Number(v).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Two-letter monogram from the member's name for the letterhead mark.
function monogram(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AW';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] || '' : '';
  return (first + last).toUpperCase() || 'AW';
}

export default function StatementSheet({ fin }: { fin: any }) {
  const opening = num(fin.opening_balance_2025);
  const c2026 = num(fin.contributions_2026);
  const sched: Record<string, any> | null =
    fin.sched_2026 && typeof fin.sched_2026 === 'object' ? fin.sched_2026 : null;
  const schedTotal = sched ? MONTHS.reduce((s, m) => s + (num(sched[m[0]]) ?? 0), 0) : (c2026 ?? 0);
  const lifetime = num(fin.lifetime_contributions) ?? ((opening ?? 0) + (c2026 ?? 0));
  const totalInterest = interestTotal(fin);
  const current = num(fin.current_balance);
  const net = num(fin.net_balance);
  const withdrawal = num(fin.withdrawal);
  const refundExit = num(fin.refund_on_exit);
  const isExiting = fin.status === 'exiting' || !!fin.refund_status;
  const asOf = fin.as_of
    ? new Date(fin.as_of).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const issued = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const ref = 'AWI-STMT-' + String(fin.member_no || '').replace(/[^\w]/g, '').toUpperCase() + '-2026';

  const interestParts: [string, number | null][] = [
    ['Interest 2018\u20132023', num(fin.interest_2018_2023)],
    ['Britam Interest', num(fin.britam_interest_life)],
    ['Jubilee MMF Interest', num(fin.jubilee_mmf)],
    ['Jubilee FIF', num(fin.jubilee_fif)],
    ['Jubilee FIF (Apr\u2013Jul 2026)', num(fin.jubilee_fif_apr_jul)],
  ];
  const shownParts = interestParts.filter((p) => p[1] != null);

  // Exit / partial-payout settlement. `current_balance` is the authoritative balance
  // still owed to the member; `withdrawal` is what has already been paid out. Anchoring
  // the gross to (pending + paid) guarantees the settlement reconciles to the cent.
  const paidOut = withdrawal != null && withdrawal > 0 ? withdrawal : 0;
  const grossEntitlement = (current ?? 0) + paidOut;

  const statusLabel =
    fin.status === 'exiting' ? 'Exiting'
    : fin.status === 'active' ? 'Active'
    : fin.status ? String(fin.status).charAt(0).toUpperCase() + String(fin.status).slice(1)
    : 'Member';
  const statusCls = fin.status === 'active' ? 'badge-good' : fin.status === 'exiting' ? 'badge-warn' : 'badge-info';

  const Row = ({ k, v, strong, neg, total }: { k: string; v: string; strong?: boolean; neg?: boolean; total?: boolean }) => (
    <div className={'stmt-row' + (total ? ' stmt-row--total' : '')}>
      <span className="stmt-row-k">{k}</span>
      <span className={'stmt-row-v num' + (strong ? ' is-strong' : '')} style={neg ? { color: 'var(--bad)' } : undefined}>{v}</span>
    </div>
  );

  return (
    <div className="card card-pad print-sheet statement-sheet">
      {/* ---- Letterhead ---- */}
      <header className="stmt-head">
        <div className="stmt-brand">
          <div className="stmt-monogram" aria-hidden="true">{monogram(fin.full_name)}</div>
          <div>
            <div className="stmt-brand-name">AWIVEST LTD</div>
            <div className="stmt-brand-tag">African Women Investors</div>
          </div>
        </div>
        <div className="stmt-doc">
          <div className="stmt-doc-title">Investment Statement</div>
          <div className="stmt-doc-meta">Ref&nbsp;&middot;&nbsp;{ref}</div>
          <div className="stmt-doc-meta">Issued&nbsp;&middot;&nbsp;{issued}</div>
        </div>
      </header>

      {/* ---- Member identity ---- */}
      <div className="stmt-identity">
        <div className="stmt-id-main">
          <div className="stmt-member-name">{fin.full_name}</div>
          <div className="stmt-member-meta">
            <span>Member&nbsp;<strong>{fin.member_no}</strong></span>
            {asOf && <span>Statement as at&nbsp;<strong>{asOf}</strong></span>}
            <span>Currency&nbsp;<strong>KES</strong></span>
          </div>
        </div>
        <span className={'badge ' + statusCls}>{statusLabel}</span>
      </div>

      {/* ---- Summary band ---- */}
      <div className="stmt-summary">
        <div className="stmt-summary-hero">
          <div className="stmt-summary-lbl">{isExiting ? 'Balance pending refund' : 'Portfolio value'}</div>
          <div className="stmt-summary-val num">{kes(current)}</div>
          {asOf && <div className="stmt-summary-note">{isExiting ? 'pending refund \u00b7 as at ' + asOf : 'as at ' + asOf}</div>}
        </div>
        <div className="stmt-summary-stat">
          <div className="stmt-summary-lbl">Lifetime contributions</div>
          <div className="stmt-summary-num num">{kes(lifetime)}</div>
        </div>
        <div className="stmt-summary-stat">
          <div className="stmt-summary-lbl">Total interest earned</div>
          <div className="stmt-summary-num num">{kes(totalInterest)}</div>
        </div>
      </div>

      {/* ---- Portfolio composition (same motif as the Dashboard / Reports) ---- */}
      {(() => {
        const contribAmt = lifetime ?? 0;
        const intAmt = totalInterest ?? 0;
        const base = contribAmt + intAmt;
        if (base <= 0) return null;
        const cPct = (contribAmt / base) * 100;
        const iPct = (intAmt / base) * 100;
        const fmtPct = (n: number) => n.toFixed(1) + '%';
        return (
          <section className="stmt-block" style={{ marginTop: 16 }}>
            <h3 className="stmt-h">How your portfolio is built</h3>
            <div style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', background: 'var(--surface2)', border: '1px solid var(--border)', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
              {cPct > 0 && <div style={{ width: cPct + '%', background: 'var(--purple2, #a6398f)', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />}
              {iPct > 0 && <div style={{ width: iPct + '%', background: 'var(--lime2, #c3e05f)', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />}
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--purple2, #a6398f)', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
                Contributions&nbsp;<strong className="num">{kes(contribAmt)}</strong>&nbsp;&middot;&nbsp;{fmtPct(cPct)}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--lime2, #c3e05f)', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
                Interest&nbsp;<strong className="num">{kes(intAmt)}</strong>&nbsp;&middot;&nbsp;{fmtPct(iPct)}
              </span>
            </div>
            <div className="stmt-fine" style={{ marginTop: 8 }}>Your lifetime contributions and the total interest earned on them make up your holdings.</div>
          </section>
        );
      })()}

      {/* ---- Exit settlement (members leaving / with a payout in progress) ---- */}
      {isExiting && (
        <section className="stmt-block" style={{ marginTop: 14, borderLeft: '3px solid var(--warn, #f2b23b)', paddingLeft: 14 }}>
          <h3 className="stmt-h">Exit settlement</h3>
          <Row k="Gross entitlement (contributions + interest)" v={kes(grossEntitlement)} />
          {paidOut > 0 && <Row k="Amount already paid out" v={'\u2212 ' + kes(paidOut)} neg />}
          <Row k="Balance pending refund" v={kes(current)} strong total />
          <div className="stmt-fine">
            {paidOut > 0
              ? kes(paidOut) + ' has already been paid out. The remaining ' + kes(current) + ' is pending refund by the AWIVEST office.'
              : 'The full balance of ' + kes(current) + ' is pending refund by the AWIVEST office.'}
          </div>
        </section>
      )}

      {/* ---- Ledger ---- */}
      <div className="stmt-cols">
        <section className="stmt-block">
          <h3 className="stmt-h">Balance</h3>
          <Row k="Opening balance (31 Dec 2025)" v={kes(opening)} />
          <Row k="Contributions (2026 YTD)" v={kes(schedTotal)} />
          <Row k="Total interest" v={kes(totalInterest)} />
          {paidOut > 0 && <Row k="Amount already paid out" v={'\u2212 ' + kes(paidOut)} neg />}
          {refundExit != null && refundExit > 0 && <Row k="Deduction on exit" v={'\u2212 ' + kes(refundExit)} neg />}
          <Row k={isExiting ? 'Balance pending refund' : 'Total portfolio value'} v={kes(current)} strong total />
          {net != null && net !== current && <Row k="Net balance in fund" v={kes(net)} />}

          <h3 className="stmt-h" style={{ marginTop: 22 }}>Contributions</h3>
          <Row k="Before 2026 (principal to 31 Dec 2025)" v={kes(opening)} />
          <Row k="Contributions in 2026" v={kes(schedTotal)} />
          <Row k="Lifetime contributions" v={kes(lifetime)} strong total />
        </section>

        <section className="stmt-block">
          <h3 className="stmt-h">Interest earned</h3>
          {shownParts.length > 0 ? (
            <>
              {shownParts.map((p) => (<Row key={p[0]} k={p[0]} v={kes(p[1])} />))}
              <Row k="Total interest" v={kes(totalInterest)} strong total />
            </>
          ) : (
            <>
              <Row k="Total interest" v={kes(totalInterest)} strong total />
              <div className="stmt-fine">Full interest split appears once the breakdown is loaded.</div>
            </>
          )}
        </section>
      </div>

      {/* ---- Monthly schedule ---- */}
      <section className="stmt-block" style={{ marginTop: 22 }}>
        <h3 className="stmt-h">Monthly contributions &middot; 2026</h3>
        {sched ? (
          <div className="stmt-months">
            {MONTHS.map((m) => {
              const v = num(sched[m[0]]);
              return (
                <div key={m[0]} className={'stmt-month' + (v ? ' is-filled' : '')}>
                  <div className="stmt-month-lbl">{m[1]}</div>
                  <div className="stmt-month-val num">{v ? Number(v).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '\u2014'}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="stmt-fine">Monthly breakdown appears once the 2026 schedule is loaded. 2026 total: <strong>{kes(c2026)}</strong>.</div>
        )}
      </section>

      {fin.notes && (
        <div className="stmt-note-box">
          <i className="fa-solid fa-circle-info" />
          <span>{fin.notes}</span>
        </div>
      )}

      {/* ---- Footer ---- */}
      <footer className="stmt-foot">
        <div className="stmt-foot-line">
          This is a computer-generated statement issued by AWIVEST LTD and is valid without a signature.
          Figures reflect the member register{asOf ? ' as at ' + asOf : ''}. For any query, please contact the AWIVEST office.
        </div>
        <div className="stmt-foot-meta">
          <span>{ref}</span>
          <span>Generated {issued}</span>
        </div>
      </footer>
    </div>
  );
}
