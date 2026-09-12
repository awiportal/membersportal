'use client';

import { useState } from 'react';
import MoneyNav from '@/components/MoneyNav';
import { interestTotal } from '@/lib/format';

type Fin = Record<string, any> | null;

const MONTHS: [string, string][] = [
  ['jan', 'Jan'], ['feb', 'Feb'], ['mar', 'Mar'], ['apr', 'Apr'], ['may', 'May'], ['jun', 'Jun'],
  ['jul', 'Jul'], ['aug', 'Aug'], ['sep', 'Sep'], ['oct', 'Oct'], ['nov', 'Nov'], ['dec', 'Dec'],
];

const kes = (v?: number | null) =>
  v == null || isNaN(Number(v)) ? '\u2014' : 'KES ' + Number(v).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kesc = (v?: number | null) => {
  if (v == null || isNaN(Number(v))) return '\u2014';
  const nn = Number(v);
  return 'KES ' + Number(nn).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const num = (v: any): number | null =>
  v == null || v === '' || isNaN(Number(v)) ? null : Number(v);

type TabId = 'overview' | 'contributions' | 'interest' | 'withdrawals';


function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const off = c * (1 - clamped / 100);
  return (
    <div className="ring-wrap" style={{ width: 132, height: 132 }}>
      <svg width={132} height={132} className="ring">
        <circle cx={66} cy={66} r={r} strokeWidth={12} fill="none" style={{ stroke: 'rgba(255,255,255,0.18)' }} />
        <circle className="ring-fill" cx={66} cy={66} r={r} strokeWidth={12}
          style={{ stroke: '#c3e05f', strokeDasharray: c, strokeDashoffset: off }} />
      </svg>
      <div className="ring-center">
        <div className="p" style={{ color: '#fff' }}>{clamped}%</div>
        <div className="l" style={{ color: 'rgba(255,255,255,0.72)' }}>{label}</div>
      </div>
    </div>
  );
}

export default function ContributionsClient({ fin }: { fin: Fin }) {
  const [tab, setTab] = useState<TabId>('overview');

  if (!fin) {
    return (
      <div>
        <MoneyNav />
        <div className="page-title">Contributions &amp; Earnings</div>
        <div className="sub">Your personal fund statement &mdash; contributions, interest and balance.</div>
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
  const totalInterest = interestTotal(fin);
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
  const partColors = ['#a6398f', '#7e2674', '#5aa9f0', '#37c98a', '#f2b23b'];

  const goalPct = goal ? Math.min(100, Math.round((schedTotal / goal) * 100)) : 0;
  const toGoal = goal - schedTotal;
  const monthsFilled = sched ? MONTHS.filter(([k]) => (num(sched[k]) ?? 0) > 0).length : 0;
  const interestShare = current ? Math.round(((totalInterest ?? 0) / current) * 100) : 0;

  const statusCls =
    fin.status === 'active' ? 'badge-good' : fin.status === 'exiting' ? 'badge-warn' : 'badge-info';
  const statusTxt = fin.status === 'exiting' ? 'Exiting' : fin.status === 'active' ? 'Active' : (fin.status || 'Member');

  const TABS: [TabId, string, string][] = [
    ['overview', 'Overview', 'fa-gauge-high'],
    ['contributions', 'Contributions', 'fa-hand-holding-dollar'],
    ['interest', 'Interest & Earnings', 'fa-coins'],
    ['withdrawals', 'Withdrawals', 'fa-money-bill-transfer'],
  ];

  const Row = ({ k, v, strong, neg }: { k: string; v: string; strong?: boolean; neg?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted" style={{ fontSize: 13.5 }}>{k}</span>
      <span className="num" style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? 16 : 13.5, textAlign: 'right', color: neg ? 'var(--bad)' : undefined }}>{v}</span>
    </div>
  );

  const Stat = ({ lbl, val, sub, icon, grad }: { lbl: string; val: string; sub?: string; icon: string; grad?: boolean }) => (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-lbl">{lbl}</span>
        <span className={`stat-ic ${grad ? 'grad-lime' : ''}`} style={{ background: grad ? undefined : 'var(--surface2)', color: grad ? '#20260a' : 'var(--lime2)' }}>
          <i className={`fa-solid ${icon}`} />
        </span>
      </div>
      <div className="stat-val num">{val}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );

  return (
    <div>
      <MoneyNav />

      <section className="hero rise">
        <div className="hero-grid">
          <div>
            <div className="hero-eyebrow">
              Contributions &amp; Earnings{fin.member_no ? ' \u00b7 ' + fin.member_no : ''}
              <span className={`badge ${statusCls}`} style={{ marginLeft: 10 }}>{statusTxt}</span>
            </div>
            <div className="hero-value">
              <span className="cur">KES</span>
              {current != null ? (Number(current) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '\u2014'}
            </div>
            <div className="hero-line">
              You have contributed {kes(lifetime)} over your membership and earned {kes(totalInterest)} in interest{asOf ? '. Figures as at ' + asOf : ''}.
            </div>
            <div className="hero-pills">
              <div className="hero-pill"><div className="k">Lifetime in</div><div className="v num">{kesc(lifetime)}</div></div>
              <div className="hero-pill"><div className="k">Interest</div><div className="v num">{kesc(totalInterest)}</div></div>
              <div className="hero-pill"><div className="k">2026 so far</div><div className="v num">{kesc(schedTotal)}</div></div>
            </div>
          </div>
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <Ring pct={goalPct} label="2026 goal" />
            <div style={{ color: 'rgba(255,255,255,0.84)', fontSize: 12.5, marginTop: 12, textAlign: 'center' }}>
              {kes(schedTotal)} of {kes(goal)}<br />{toGoal > 0 ? kes(toGoal) + ' to go' : 'Goal reached'}
            </div>
          </div>
        </div>
      </section>

      <div className="tabs rise-2" style={{ marginTop: 16, maxWidth: 700 }}>
        {TABS.map(([id, label, icon]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} type="button">
            <i className={`fa-solid ${icon}`} style={{ marginRight: 7, fontSize: 12 }} />
            {label}
          </button>
        ))}
      </div>

      <div className="rise-3" style={{ marginTop: 18 }}>
        {tab === 'overview' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="metricgrid">
              <Stat lbl="Current balance" val={kes(current)} sub="Live fund position" icon="fa-wallet" grad />
              <Stat lbl="Lifetime contributions" val={kes(lifetime)} sub="Since you joined" icon="fa-piggy-bank" />
              <Stat lbl="Total interest earned" val={kes(totalInterest)} sub={`${interestShare}% of your balance`} icon="fa-coins" />
              <Stat lbl="2026 contributions" val={kes(schedTotal)} sub={`${goalPct}% of your goal`} icon="fa-hand-holding-dollar" />
            </div>

            <div className="insightgrid">
              <div className="insight">
                <span className="ic-round"><i className="fa-solid fa-bullseye" /></span>
                <div>
                  <div className="insight-t">{goalPct}% of your 2026 goal</div>
                  <div className="insight-d">{toGoal > 0 ? kes(toGoal) + ' more takes you to ' + kes(goal) + ' this year.' : 'You have reached your ' + kes(goal) + ' goal for 2026.'}</div>
                </div>
              </div>
              <div className="insight">
                <span className="ic-round"><i className="fa-solid fa-coins" /></span>
                <div>
                  <div className="insight-t">{interestShare}% is interest</div>
                  <div className="insight-d">{kes(totalInterest)} of your balance is interest the fund earned on your behalf.</div>
                </div>
              </div>
            </div>

            <div className="card card-pad">
              <div className="section-title" style={{ marginBottom: 10 }}>Statement summary</div>
              <Row k="Opening balance (31 Dec 2025)" v={kes(opening)} />
              <Row k="Contributions in 2026" v={kes(schedTotal)} />
              <Row k="Total interest earned" v={kes(totalInterest)} />
              {withdrawal != null && withdrawal > 0 && <Row k="Withdrawals" v={'\u2212 ' + kes(withdrawal)} neg />}
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
                <div className="section-title">2026 annual goal</div>
                <div className="muted num" style={{ fontSize: 13 }}>{kes(schedTotal)} of {kes(goal)}</div>
              </div>
              <div className="bar" style={{ marginTop: 12, height: 12 }}><span style={{ width: `${goalPct}%` }} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <span className="muted" style={{ fontSize: 12.5 }}>{goalPct}% of goal &middot; {monthsFilled} of 12 months funded</span>
                <span className="muted" style={{ fontSize: 12.5 }}>{toGoal > 0 ? `${kes(toGoal)} to goal` : 'Goal reached'}</span>
              </div>
            </div>

            <div className="card card-pad">
              <div className="section-title" style={{ marginBottom: 12 }}>2026 contribution schedule</div>
              {sched ? (
                <div className="monthgrid">
                  {MONTHS.map(([k, label]) => {
                    const v = num(sched[k]);
                    return (
                      <div key={k} className={`monthchip ${v ? 'on' : 'off'}`}>
                        <div className="m">{label}</div>
                        <div className="a num">{v ? Number(v).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '\u2014'}</div>
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
            <div className="section-title" style={{ marginBottom: 4 }}>Interest &amp; earnings</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>How your total interest of {kes(totalInterest)} was earned.</div>
            {hasSplit ? (
              <div style={{ display: 'grid', gap: 15 }}>
                {interestParts.map(([label, v], i) => (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="dotc" style={{ width: 10, height: 10, borderRadius: 3, background: partColors[i % partColors.length] }} />{label}
                      </span>
                      <span className="num" style={{ fontWeight: 700, fontSize: 13.5 }}>{kes(v)}</span>
                    </div>
                    <div className="minibar" style={{ height: 9 }}><span style={{ width: `${maxPart ? Math.max(3, Math.round((v / maxPart) * 100)) : 0}%`, background: partColors[i % partColors.length] }} /></div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--border2)', paddingTop: 12, marginTop: 4 }}>
                  <span style={{ fontWeight: 800 }}>Total interest</span>
                  <span className="num" style={{ fontWeight: 800 }}>{kes(totalInterest)}</span>
                </div>
              </div>
            ) : (
              <div>
                <Row k="Britam interest" v={kes(num(fin.britam_interest_2026))} />
                <Row k="Jubilee interest" v={kes(num(fin.jubilee_interest_2026))} />
                <Row k="Total interest" v={kes(totalInterest)} strong />
                <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>The full breakdown (2018&ndash;2023, Britam, Jubilee MMF &amp; FIF) appears once loaded.</div>
              </div>
            )}
          </div>
        )}

        {tab === 'withdrawals' && (
          <div className="card card-pad">
            <div className="section-title" style={{ marginBottom: 12 }}>Withdrawals</div>
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
