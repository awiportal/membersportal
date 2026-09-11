'use client';

import { useState } from 'react';

type Fin = Record<string, any> | null;

const MONTHS: [string, string][] = [
  ['jan', 'Jan'], ['feb', 'Feb'], ['mar', 'Mar'], ['apr', 'Apr'], ['may', 'May'], ['jun', 'Jun'],
  ['jul', 'Jul'], ['aug', 'Aug'], ['sep', 'Sep'], ['oct', 'Oct'], ['nov', 'Nov'], ['dec', 'Dec'],
];

const kes = (v?: number | null) =>
  v == null || isNaN(Number(v)) ? '\u2014' : 'KES ' + Math.round(Number(v)).toLocaleString('en-KE');

const num = (v: any): number | null =>
  v == null || v === '' || isNaN(Number(v)) ? null : Number(v);

type TabId = 'overview' | 'contributions' | 'interest' | 'withdrawals';

export default function ContributionsClient({ fin }: { fin: Fin }) {
  const [tab, setTab] = useState<TabId>('overview');

  if (!fin) {
    return (
      <div>
        <div className="page-title">Contributions &amp; Earnings</div>
        <div className="sub">Your personal fund statement — contributions, interest and balance.</div>
        <div className="card card-pad" style={{ marginTop: 20, textAlign: 'center', padding: '44px 24px' }}>
          <div style={{ fontSize: 34, color: 'var(--muted2)', marginBottom: 12 }}>
            <i className="fa-solid fa-file-circle-question" />
          </div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Your statement isn&apos;t linked yet</div>
          <div className="muted" style={{ fontSize: 13.5, maxWidth: 470, margin: '8px auto 0', lineHeight: 1.6 }}>
            Your AWIVEST fund record will appear here once your membership number is linked to this login. This happens
            automatically when you finish onboarding with your National ID, or the office can link it for you.
          </div>
        </div>
      </div>
    );
  }

  const opening = num(fin.opening_balance_2025);
  const c2026 = num(fin.contributions_2026);
  const lifetime = num(fin.lifetime_contributions) ?? ((opening ?? 0) + (c2026 ?? 0));
  const totalInterest = num(fin.total_interest_2026);
  const current = num(fin.current_balance);
  const net = num(fin.net_balance);
  const goal = num(fin.annual_goal) ?? 300000;
  const withdrawal = num(fin.withdrawal) ?? num(fin.refund_on_exit);
  const asOf = fin.as_of
    ? new Date(fin.as_of).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  const sched: Record<string, any> | null =
    fin.sched_2026 && typeof fin.sched_2026 === 'object' ? fin.sched_2026 : null;
  const schedTotal = sched ? MONTHS.reduce((s, [k]) => s + (num(sched[k]) ?? 0), 0) : c2026 ?? 0;

  const interestParts = ([
    ['Interest 2018\u20132023', num(fin.interest_2018_2023)],
    ['Britam Interest', num(fin.britam_interest_life)],
    ['Jubilee MMF Interest', num(fin.jubilee_mmf)],
    ['Jubilee FIF', num(fin.jubilee_fif)],
    ['Jubilee FIF (Apr\u2013Jul 2026)', num(fin.jubilee_fif_apr_jul)],
  ] as [string, number | null][]).filter((p) => p[1] != null) as [string, number][];
  const hasSplit = interestParts.length > 0;
  const maxPart = hasSplit ? Math.max(...interestParts.map((p) => p[1])) : 0;

  const goalPct = goal ? Math.min(100, Math.round((schedTotal / goal) * 100)) : 0;
  const toGoal = goal - schedTotal;

  const statusCls =
    fin.status === 'active' ? 'badge-good' : fin.status === 'exiting' ? 'badge-warn' : 'badge-info';

  const TABS: [TabId, string, string][] = [
    ['overview', 'Overview', 'fa-gauge-high'],
    ['contributions', 'Contributions', 'fa-hand-holding-dollar'],
    ['interest', 'Interest & Earnings', 'fa-coins'],
    ['withdrawals', 'Withdrawals', 'fa-money-bill-transfer'],
  ];

  const Row = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted" style={{ fontSize: 13.5 }}>{k}</span>
      <span style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? 15 : 13.5, textAlign: 'right' }}>{v}</span>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">Contributions &amp; Earnings</div>
          <div className="sub">
            {fin.member_no ? `${fin.member_no} \u00b7 ` : ''}All amounts in KES{asOf ? ` \u00b7 as at ${asOf}` : ''}
          </div>
        </div>
        <span className={`badge ${statusCls}`} style={{ marginTop: 4 }}>
          {fin.status === 'exiting' ? 'Exiting' : fin.status === 'active' ? 'Active' : (fin.status || 'Member')}
        </span>
      </div>

      <div className="tabs" style={{ marginTop: 18, maxWidth: 640 }}>
        {TABS.map(([id, label, icon]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} type="button">
            <i className={`fa-solid ${icon}`} style={{ marginRight: 7, fontSize: 12 }} />
            {label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        {tab === 'overview' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))' }}>
              <div className="card kpi">
                <div className="ic grad-lime" style={{ color: '#20260a' }}><i className="fa-solid fa-wallet" /></div>
                <div className="lbl" style={{ marginTop: 12 }}>Current balance</div>
                <div className="val">{kes(current)}</div>
              </div>
              <div className="card kpi">
                <div className="ic" style={{ background: 'var(--surface2)', color: 'var(--lime2)' }}><i className="fa-solid fa-hand-holding-dollar" /></div>
                <div className="lbl" style={{ marginTop: 12 }}>Lifetime contributions</div>
                <div className="val">{kes(lifetime)}</div>
              </div>
              <div className="card kpi">
                <div className="ic" style={{ background: 'var(--surface2)', color: 'var(--lime2)' }}><i className="fa-solid fa-coins" /></div>
                <div className="lbl" style={{ marginTop: 12 }}>Total interest earned</div>
                <div className="val">{kes(totalInterest)}</div>
              </div>
              <div className="card kpi">
                <div className="ic" style={{ background: 'var(--surface2)', color: 'var(--lime2)' }}><i className="fa-solid fa-piggy-bank" /></div>
                <div className="lbl" style={{ marginTop: 12 }}>2026 contributions</div>
                <div className="val">{kes(schedTotal)}</div>
              </div>
            </div>

            <div className="card card-pad">
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Statement summary</div>
              <Row k="Opening balance (31 Dec 2025)" v={kes(opening)} />
              <Row k="Contributions in 2026" v={kes(schedTotal)} />
              <Row k="Total interest earned" v={kes(totalInterest)} />
              {withdrawal != null && withdrawal > 0 && <Row k="Withdrawals" v={`- ${kes(withdrawal)}`} />}
              <Row k="Current balance" v={kes(current)} strong />
              {net != null && net !== current && <Row k="Net balance in fund" v={kes(net)} />}
              {fin.notes && (
                <div className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
                  <i className="fa-solid fa-circle-info" style={{ marginRight: 6 }} />{fin.notes}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'contributions' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="card card-pad">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>2026 annual goal</div>
                <div className="muted" style={{ fontSize: 13 }}>{kes(schedTotal)} of {kes(goal)}</div>
              </div>
              <div className="bar" style={{ marginTop: 12 }}><span style={{ width: `${goalPct}%` }} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <span className="muted" style={{ fontSize: 12.5 }}>{goalPct}% of goal</span>
                <span className="muted" style={{ fontSize: 12.5 }}>{toGoal > 0 ? `${kes(toGoal)} to goal` : 'Goal reached'}</span>
              </div>
            </div>

            <div className="card card-pad">
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>2026 contribution schedule</div>
              {sched ? (
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(96px,1fr))' }}>
                  {MONTHS.map(([k, label]) => {
                    const v = num(sched[k]);
                    return (
                      <div key={k} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}>
                        <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
                        <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 3, color: v ? 'var(--text)' : 'var(--muted2)' }}>
                          {v ? Math.round(v).toLocaleString('en-KE') : '\u2014'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 13 }}>
                  Monthly breakdown appears once the 2026 schedule is loaded. Total contributed in 2026: <strong>{kes(c2026)}</strong>.
                </div>
              )}
            </div>

            <div className="card card-pad">
              <Row k="Contributions before 2026 (principal to 31 Dec 2025)" v={kes(opening)} />
              <Row k="Contributions in 2026" v={kes(schedTotal)} />
              <Row k="Lifetime contributions" v={kes(lifetime)} strong />
            </div>
          </div>
        )}

        {tab === 'interest' && (
          <div className="card card-pad">
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Interest &amp; earnings</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>How your total interest of {kes(totalInterest)} was earned.</div>
            {hasSplit ? (
              <div style={{ display: 'grid', gap: 14 }}>
                {interestParts.map(([label, v]) => (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13.5 }}>{label}</span>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{kes(v)}</span>
                    </div>
                    <div className="bar"><span style={{ width: `${maxPart ? Math.max(3, Math.round((v / maxPart) * 100)) : 0}%` }} /></div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 2 }}>
                  <span style={{ fontWeight: 800 }}>Total interest</span>
                  <span style={{ fontWeight: 800 }}>{kes(totalInterest)}</span>
                </div>
              </div>
            ) : (
              <div>
                <Row k="Britam interest" v={kes(num(fin.britam_interest_2026))} />
                <Row k="Jubilee interest" v={kes(num(fin.jubilee_interest_2026))} />
                <Row k="Total interest" v={kes(totalInterest)} strong />
                <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>The full breakdown (2018–2023, Britam, Jubilee MMF &amp; FIF) appears once loaded.</div>
              </div>
            )}
          </div>
        )}

        {tab === 'withdrawals' && (
          <div className="card card-pad">
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Withdrawals</div>
            {(withdrawal != null && withdrawal > 0) || fin.refund_status ? (
              <div>
                {withdrawal != null && withdrawal > 0 && <Row k="Amount withdrawn / refunded" v={kes(withdrawal)} />}
                {fin.refund_status && <Row k="Refund status" v={String(fin.refund_status).replace('_', ' ')} />}
                {fin.status === 'exiting' && <Row k="Membership" v="Exiting (refund in process)" />}
                {fin.notes && (
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.6 }}>
                    <i className="fa-solid fa-circle-info" style={{ marginRight: 6 }} />{fin.notes}
                  </div>
                )}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>No withdrawals on record. Your full balance remains invested in the fund.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
