'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { KES, KESc } from '@/lib/format';
import Donut from '@/components/Donut';
import AreaChart from '@/components/AreaChart';
import { projectGoal } from '@/lib/goals';
import { ASSET_MIX, futureValue, requiredMonthly, inflate } from '@/lib/planning';
import { RISK_PROFILE_LABELS, type RiskProfile } from '@/lib/msi';

type Goal = {
  id: string;
  name: string;
  target_amount: number | string;
  saved_amount: number | string;
  target_date: string | null;
};

type TabKey = 'retire' | 'growth' | 'sip' | 'infl';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'retire', label: 'Retirement', icon: 'fa-umbrella-beach' },
  { key: 'growth', label: 'Investment Growth', icon: 'fa-chart-line' },
  { key: 'sip', label: 'Goal / SIP', icon: 'fa-bullseye' },
  { key: 'infl', label: 'Inflation Impact', icon: 'fa-fire' },
];

const num = (s: string | number) => Number(String(s).replace(/[^0-9.]/g, '')) || 0;

function fieldsFor(tab: TabKey, rate: string): { id: string; label: string; def: string }[] {
  switch (tab) {
    case 'retire':
      return [
        { id: 'pv', label: 'Current savings (KES)', def: '3,240,000' },
        { id: 'pmt', label: 'Monthly contribution (KES)', def: '42,000' },
        { id: 'yrs', label: 'Years to retirement', def: '15' },
        { id: 'rate', label: 'Expected return %', def: rate },
      ];
    case 'growth':
      return [
        { id: 'pv', label: 'Starting amount (KES)', def: '500,000' },
        { id: 'pmt', label: 'Monthly contribution (KES)', def: '25,000' },
        { id: 'yrs', label: 'Years', def: '10' },
        { id: 'rate', label: 'Expected return %', def: rate },
      ];
    case 'sip':
      return [
        { id: 'target', label: 'Target amount (KES)', def: '4,500,000' },
        { id: 'saved', label: 'Already saved (KES)', def: '1,980,000' },
        { id: 'yrs', label: 'Years to goal', def: '5' },
        { id: 'rate', label: 'Expected return %', def: rate },
      ];
    case 'infl':
      return [
        { id: 'amt', label: 'Amount today (KES)', def: '1,000,000' },
        { id: 'yrs', label: 'Years', def: '15' },
        { id: 'rate', label: 'Inflation rate %', def: '6' },
      ];
  }
}

function defaultsFor(tab: TabKey, rate: string): Record<string, string> {
  const o: Record<string, string> = {};
  fieldsFor(tab, rate).forEach((f) => (o[f.id] = f.def));
  return o;
}

type CalcOut = { value: number; perMonth: boolean; note: string; yearly: number[]; title: string; desc: string };

function compute(tab: TabKey, v: Record<string, string>): CalcOut {
  const yrs = num(v.yrs);
  const rate = num(v.rate);
  if (tab === 'retire' || tab === 'growth') {
    const r = futureValue({ startingBalance: num(v.pv), monthly: num(v.pmt), years: yrs, annualRatePct: rate });
    return {
      value: r.projected,
      perMonth: false,
      note: tab === 'retire' ? `at retirement in ${yrs} years` : `in ${yrs} years`,
      yearly: r.yearly,
      title: tab === 'retire' ? 'Projected retirement pot' : 'Investment growth',
      desc: tab === 'retire' ? 'Your savings today plus monthly contributions, grown to retirement.' : 'Grow a starting amount plus monthly contributions over time.',
    };
  }
  if (tab === 'sip') {
    const pmt = requiredMonthly({ target: num(v.target), saved: num(v.saved), years: yrs, annualRatePct: rate });
    const yearly = futureValue({ startingBalance: num(v.saved), monthly: pmt, years: yrs, annualRatePct: rate }).yearly;
    return {
      value: pmt,
      perMonth: true,
      note: 'needed per month',
      yearly,
      title: 'Goal / SIP planner',
      desc: 'The monthly contribution needed to reach a target by your date.',
    };
  }
  const inf = inflate({ amount: num(v.amt), years: yrs, ratePct: rate });
  return {
    value: inf.future,
    perMonth: false,
    note: `future cost in ${yrs} years`,
    yearly: inf.yearly,
    title: 'Inflation impact',
    desc: 'What a sum today will cost in future money.',
  };
}

export default function PlanningClient({
  hasProfile,
  planningReturn,
  riskProfile,
  wellnessScore,
  wellnessBand,
  goals,
}: {
  hasProfile: boolean;
  planningReturn: number;
  riskProfile: string | null;
  wellnessScore: number | null;
  wellnessBand: string | null;
  goals: Goal[];
}) {
  const rp = ((riskProfile as RiskProfile) in ASSET_MIX ? riskProfile : 'balanced') as RiskProfile;
  const rateStr = String(planningReturn);

  const goalStats = useMemo(() => {
    let target = 0;
    let saved = 0;
    let monthly = 0;
    let reached = 0;
    for (const g of goals) {
      const t = Number(g.target_amount) || 0;
      const s = Number(g.saved_amount) || 0;
      target += t;
      saved += s;
      const proj = projectGoal({ target: t, saved: s, targetDate: g.target_date, annualRatePct: planningReturn });
      if (proj.reached) reached += 1;
      if (proj.requiredMonthly && proj.requiredMonthly > 0) monthly += proj.requiredMonthly;
    }
    return { count: goals.length, target, saved, monthly, reached, pct: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0 };
  }, [goals, planningReturn]);

  const [tab, setTab] = useState<TabKey>('retire');
  const [vals, setVals] = useState<Record<string, string>>(() => defaultsFor('retire', rateStr));
  function switchTab(t: TabKey) {
    setTab(t);
    setVals(defaultsFor(t, rateStr));
  }
  const out = useMemo(() => compute(tab, vals), [tab, vals]);

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div className="page-title">Planning Centre</div>
      <div className="sub">
        Your financial picture in one place — profile, goals, a target asset mix, and four calculators tuned to your{' '}
        {RISK_PROFILE_LABELS[rp]} profile ({planningReturn}% p.a.).
      </div>

      {/* Snapshot */}
      {hasProfile ? (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', marginTop: 16 }}>
          <div className="card kpi hover-lift">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="lbl">Financial wellness (MSI)</span>
              <span className="ic grad-purple" style={{ color: '#fff' }}><i className="fa-solid fa-heart-pulse" /></span>
            </div>
            <div className="val num">
              {wellnessScore ?? '—'}
              {wellnessScore != null && <span className="muted" style={{ fontSize: 15, fontWeight: 600 }}>/100</span>}
            </div>
            {wellnessBand && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{wellnessBand}</div>}
          </div>
          <div className="card kpi hover-lift">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="lbl">Risk profile</span>
              <span className="ic" style={{ background: 'var(--surface2)' }}><i className="fa-solid fa-gauge-high" style={{ color: 'var(--lime2)' }} /></span>
            </div>
            <div className="val" style={{ fontSize: 21 }}>{RISK_PROFILE_LABELS[rp]}</div>
          </div>
          <div className="card kpi hover-lift">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="lbl">Planning return</span>
              <span className="ic" style={{ background: 'var(--surface2)' }}><i className="fa-solid fa-arrow-trend-up" style={{ color: 'var(--lime2)' }} /></span>
            </div>
            <div className="val num">{planningReturn}% <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>p.a.</span></div>
          </div>
        </div>
      ) : (
        <div className="card card-pad" style={{ marginTop: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', border: '1px solid rgba(166,205,53,0.3)' }}>
          <div className="grad-lime" style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', color: '#20260a', flexShrink: 0 }}>
            <i className="fa-solid fa-heart-pulse" />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700 }}>Complete your Financial Profile</div>
            <div className="muted" style={{ fontSize: 13 }}>
              It powers your risk profile, planning return, and a personalised asset mix. Until then we assume a Balanced profile at {planningReturn}% p.a.
            </div>
          </div>
          <Link href="/financial-profile" className="btn btn-lime">Start <i className="fa-solid fa-arrow-right" /></Link>
        </div>
      )}

      {/* Goals summary + asset mix */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
        <div className="card card-pad hover-lift" style={{ flex: '1 1 360px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Your goals</div>
            <Link href="/goals" className="btn btn-ghost btn-sm">Manage <i className="fa-solid fa-arrow-right" /></Link>
          </div>
          {goalStats.count === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>No goals yet. Add your first goal in the Goal Tracker to see your combined plan here.</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span className="muted">{KES(goalStats.saved)} saved</span>
                <span className="muted num">{goalStats.pct}% of {KES(goalStats.target)}</span>
              </div>
              <div className="bar"><span style={{ width: `${goalStats.pct}%` }} /></div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                <div style={{ flex: '1 1 100px' }}>
                  <div className="muted" style={{ fontSize: 12 }}>Goals</div>
                  <div className="num" style={{ fontWeight: 800, fontSize: 20 }}>{goalStats.count}</div>
                </div>
                <div style={{ flex: '1 1 100px' }}>
                  <div className="muted" style={{ fontSize: 12 }}>Reached</div>
                  <div className="num" style={{ fontWeight: 800, fontSize: 20 }}>{goalStats.reached}</div>
                </div>
                <div style={{ flex: '1 1 140px' }}>
                  <div className="muted" style={{ fontSize: 12 }}>Combined monthly</div>
                  <div className="num" style={{ fontWeight: 800, fontSize: 20 }}>{KES(goalStats.monthly)}</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="card card-pad hover-lift" style={{ flex: '1 1 360px' }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Suggested asset mix</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>A {RISK_PROFILE_LABELS[rp]} target allocation{hasProfile ? '' : ' (assumed)'}.</div>
          <Donut segments={ASSET_MIX[rp]} />
          <div className="muted2" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>
            Illustrative guidance to support your planning — not financial advice or a recommendation to buy any security.
          </div>
        </div>
      </div>

      {/* Calculators */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>Planning calculators</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Pre-tuned to your planning return. Illustrative only.</div>

        <div className="tabs" style={{ flexWrap: 'wrap', marginBottom: 20 }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => switchTab(t.key)}>
              <i className={`fa-solid ${t.icon}`} /> {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div className="card card-pad hover-lift" style={{ flex: '1 1 280px' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Your figures</div>
            {fieldsFor(tab, rateStr).map((f) => (
              <div className="field" key={f.id}>
                <label>{f.label}</label>
                <input className="input" inputMode="numeric" value={vals[f.id] ?? ''} onChange={(e) => setVals((prev) => ({ ...prev, [f.id]: e.target.value }))} />
              </div>
            ))}
          </div>

          <div className="card card-pad hover-lift" style={{ flex: '2 1 340px' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{out.title}</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{out.desc}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div className="num grad-text" style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>
                {out.perMonth ? KES(out.value) : KESc(out.value)}
              </div>
              <div className="muted" style={{ fontSize: 12.5, paddingBottom: 6 }}>{out.note}</div>
            </div>
            <AreaChart data={out.yearly} height={210} />
            <div className="muted2" style={{ fontSize: 11, textAlign: 'right', marginTop: 4 }}>Projection over {num(vals.yrs)} years</div>
          </div>
        </div>
      </div>
    </div>
  );
}
