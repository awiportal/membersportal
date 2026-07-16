'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KES } from '@/lib/format';
import {
  computeMsi,
  bandFor,
  EMPTY_ANSWERS,
  PILLARS,
  PILLAR_MAX,
  EXPERIENCE_LABELS,
  RISK_LABELS,
  HORIZON_LABELS,
  RISK_PROFILE_LABELS,
  type MsiAnswers,
  type MsiResult,
  type Experience,
  type RiskAppetite,
  type Horizon,
  type SubScores,
} from '@/lib/msi';
import { saveFinancialProfile } from './actions';

const STEPS = [
  { key: 'income', label: 'Income', icon: 'fa-wallet' },
  { key: 'safety', label: 'Safety net', icon: 'fa-shield-halved' },
  { key: 'debt', label: 'Debt', icon: 'fa-scale-balanced' },
  { key: 'investing', label: 'Investing', icon: 'fa-seedling' },
  { key: 'review', label: 'Review', icon: 'fa-clipboard-check' },
] as const;

function bandColor(band: string): string {
  if (band === 'Excellent') return 'var(--good)';
  if (band === 'Good') return 'var(--lime2)';
  if (band === 'Average') return 'var(--warn)';
  return 'var(--bad)';
}

// ----- small presentational helpers ---------------------------------------

function MoneyInput({
  label,
  value,
  onChange,
  hint,
  autoFocus,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="input-group">
        <i className="fa-solid fa-coins" />
        <input
          className="input"
          inputMode="numeric"
          autoFocus={autoFocus}
          value={value ? String(value) : ''}
          onChange={(e) => onChange(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
          placeholder="0"
        />
      </div>
      {hint && (
        <div className="muted2" style={{ fontSize: 12, marginTop: 6 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  hint,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  suffix?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="input-group">
        <i className="fa-solid fa-hashtag" />
        <input
          className="input"
          inputMode="numeric"
          value={value ? String(value) : ''}
          onChange={(e) => onChange(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
          placeholder="0"
          style={{ paddingRight: suffix ? 64 : undefined }}
        />
        {suffix && (
          <span className="muted2" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13 }}>
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <div className="muted2" style={{ fontSize: 12, marginTop: 6 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className="btn"
              style={{
                justifyContent: 'flex-start',
                background: active ? 'linear-gradient(135deg,rgba(166,205,53,0.18),rgba(126,38,116,0.14))' : 'var(--surface2)',
                border: `1px solid ${active ? 'rgba(166,205,53,0.4)' : 'var(--border)'}`,
                color: 'var(--text)',
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  display: 'grid',
                  placeItems: 'center',
                  border: `2px solid ${active ? 'var(--lime)' : 'var(--muted2)'}`,
                  flexShrink: 0,
                }}
              >
                {active && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--lime)' }} />}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScoreRing({ score, band, size = 168 }: { score: number; band: string; size?: number }) {
  const stroke = 13;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, score / 100));
  const color = bandColor(band);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - filled)}
          style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div className="num" style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>
            {score}
            <span className="muted" style={{ fontSize: 17, fontWeight: 600 }}>/100</span>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color, marginTop: 4 }}>{band}</div>
        </div>
      </div>
    </div>
  );
}

function PillarBars({ sub }: { sub: SubScores }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
      {PILLARS.map((p) => {
        const v = Number((sub as any)?.[p.key] ?? 0);
        const pctv = Math.round((v / PILLAR_MAX) * 100);
        return (
          <div key={p.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13.5 }}>
              <span style={{ fontWeight: 600 }}>
                <i className={`fa-solid ${p.icon}`} style={{ color: 'var(--lime2)', width: 18 }} /> {p.label}
              </span>
              <span className="muted num">
                {v}/{PILLAR_MAX}
              </span>
            </div>
            <div className="bar">
              <span style={{ width: `${pctv}%` }} />
            </div>
            <div className="muted2" style={{ fontSize: 11.5, marginTop: 4 }}>
              {p.hint}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ----- results view --------------------------------------------------------

function ResultView({
  data,
  fresh,
  onEdit,
}: {
  data: MsiResult;
  fresh: boolean;
  onEdit: () => void;
}) {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-title">
        Financial Profile <span className="badge badge-lime" style={{ verticalAlign: 'middle', marginLeft: 8 }}>MSI</span>
      </div>
      <div className="sub">Your Member financial-wellness Index — a snapshot of how ready you are to invest and grow.</div>

      {fresh && (
        <div className="badge badge-good" style={{ marginTop: 16 }}>
          <i className="fa-solid fa-circle-check" /> Saved. Your dashboard wellness score is now up to date.
        </div>
      )}

      <div className="card card-pad hover-lift" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
          <ScoreRing score={data.wellness_score} band={data.wellness_band} />
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Your MSI breakdown</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              Each pillar is scored out of {PILLAR_MAX}. They add up to your overall MSI.
            </div>
            <PillarBars sub={data.sub_scores} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', marginTop: 16 }}>
        <div className="card card-pad hover-lift">
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 500 }}>Your risk profile</div>
          <div style={{ fontWeight: 800, fontSize: 22, marginTop: 6 }}>{RISK_PROFILE_LABELS[data.risk_profile]}</div>
          <div className="muted2" style={{ fontSize: 12.5, marginTop: 6 }}>
            Based on your risk appetite and time horizon.
          </div>
        </div>
        <div className="card card-pad hover-lift">
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 500 }}>Illustrative planning return</div>
          <div className="num" style={{ fontWeight: 800, fontSize: 22, marginTop: 6 }}>
            {data.planning_return}% <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>p.a.</span>
          </div>
          <div className="muted2" style={{ fontSize: 12.5, marginTop: 6 }}>
            Used to project your goals. Illustrative only, not a guarantee.
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
          <i className="fa-solid fa-lightbulb" style={{ color: 'var(--lime2)' }} /> Ways to strengthen your profile
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.recommendations.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span className="grad-lime" style={{ width: 26, height: 26, borderRadius: 9, display: 'grid', placeItems: 'center', color: '#20260a', flexShrink: 0, fontWeight: 800, fontSize: 12 }}>
                {i + 1}
              </span>
              <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{r}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={onEdit}>
          <i className="fa-solid fa-pen-to-square" /> Update my profile
        </button>
      </div>
    </div>
  );
}

// ----- wizard --------------------------------------------------------------

export default function FinancialProfileClient({
  profile,
  startEdit,
}: {
  profile: any | null;
  startEdit: boolean;
}) {
  const router = useRouter();

  const savedResult: MsiResult | null = profile
    ? {
        wellness_score: profile.wellness_score ?? 0,
        wellness_band: profile.wellness_band ?? bandFor(profile.wellness_score ?? 0),
        sub_scores: (profile.sub_scores as SubScores) ?? { savings: 0, emergency: 0, debt: 0, investing: 0 },
        risk_profile: profile.risk_profile ?? 'balanced',
        planning_return: Number(profile.planning_return ?? 9),
        recommendations: Array.isArray(profile.recommendations) ? profile.recommendations : [],
      }
    : null;

  const [answers, setAnswers] = useState<MsiAnswers>({ ...EMPTY_ANSWERS, ...(profile?.answers ?? {}) });
  const [mode, setMode] = useState<'result' | 'wizard'>(savedResult && !startEdit ? 'result' : 'wizard');
  const [stepIdx, setStepIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<MsiResult | null>(null);

  const set = <K extends keyof MsiAnswers>(k: K, v: MsiAnswers[K]) => setAnswers((a) => ({ ...a, [k]: v }));

  const preview = useMemo(() => computeMsi(answers), [answers]);
  const step = STEPS[stepIdx];
  const canContinue = stepIdx !== 0 || answers.monthly_income > 0;

  if (mode === 'result') {
    const data = justSaved ?? savedResult;
    if (data) {
      return (
        <ResultView
          data={data}
          fresh={!!justSaved}
          onEdit={() => {
            setJustSaved(null);
            setStepIdx(0);
            setMode('wizard');
          }}
        />
      );
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await saveFinancialProfile(answers);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setJustSaved(computeMsi(answers));
    setMode('result');
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="page-title">
        Financial Profile <span className="badge badge-lime" style={{ verticalAlign: 'middle', marginLeft: 8 }}>MSI</span>
      </div>
      <div className="sub">
        Answer a few quick questions and we&apos;ll calculate your Member financial-wellness Index. It only takes a
        couple of minutes, and you can update it any time.
      </div>

      {/* Stepper */}
      <div className="card card-pad" style={{ marginTop: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            const reachable = i <= stepIdx;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => reachable && setStepIdx(i)}
                className="btn btn-sm"
                style={{
                  flex: '1 1 120px',
                  justifyContent: 'flex-start',
                  cursor: reachable ? 'pointer' : 'default',
                  background: active ? 'linear-gradient(135deg,var(--purple2),var(--purple))' : 'var(--surface2)',
                  color: active ? '#fff' : reachable ? 'var(--text)' : 'var(--muted2)',
                  border: '1px solid var(--border)',
                  opacity: reachable ? 1 : 0.6,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 10.5,
                    fontWeight: 800,
                    background: done ? 'var(--lime)' : active ? 'rgba(255,255,255,.25)' : 'var(--surface)',
                    color: done ? '#20260a' : '#fff',
                  }}
                >
                  {done ? <i className="fa-solid fa-check" /> : i + 1}
                </span>
                <span style={{ fontSize: 12 }}>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="badge badge-bad" style={{ marginBottom: 14 }}>
          <i className="fa-solid fa-circle-exclamation" /> {error}
        </div>
      )}

      <div className="card card-pad">
        {step.key === 'income' && (
          <>
            <StepHead icon="fa-wallet" title="Income & contributing" sub="Let's start with what comes in and what you can put to work each month." />
            <MoneyInput
              label="Your total monthly income (KES)"
              value={answers.monthly_income}
              onChange={(n) => set('monthly_income', n)}
              hint="All sources combined, before expenses."
              autoFocus
            />
            <MoneyInput
              label="Amount you can invest or save each month (KES)"
              value={answers.monthly_invest}
              onChange={(n) => set('monthly_invest', n)}
              hint="Including your AWIVEST contributions."
            />
          </>
        )}

        {step.key === 'safety' && (
          <>
            <StepHead icon="fa-shield-halved" title="Your safety net" sub="A cushion for surprises keeps your investments working for you." />
            <NumberInput
              label="Months of expenses your emergency fund covers"
              value={answers.emergency_months}
              onChange={(n) => set('emergency_months', n)}
              suffix="months"
              hint="A healthy target is 3 to 6 months."
            />
            <MoneyInput
              label="Current savings set aside (KES)"
              value={answers.current_savings}
              onChange={(n) => set('current_savings', n)}
              hint="Cash and easily accessible savings."
            />
          </>
        )}

        {step.key === 'debt' && (
          <>
            <StepHead icon="fa-scale-balanced" title="Debt & obligations" sub="Understanding your commitments helps us tailor safe recommendations." />
            <MoneyInput
              label="Total debt outstanding (KES)"
              value={answers.total_debt}
              onChange={(n) => set('total_debt', n)}
              hint="Loans, credit, and any balances owed."
            />
            <MoneyInput
              label="Monthly debt repayments (KES)"
              value={answers.monthly_debt}
              onChange={(n) => set('monthly_debt', n)}
              hint="What you pay toward debt each month."
            />
            <NumberInput
              label="People who depend on you financially"
              value={answers.dependents}
              onChange={(n) => set('dependents', n)}
              suffix="people"
            />
          </>
        )}

        {step.key === 'investing' && (
          <>
            <StepHead icon="fa-seedling" title="Your investing profile" sub="This shapes your risk profile and the goals we help you plan." />
            <Choice<Experience>
              label="How would you describe your investing experience?"
              value={answers.experience}
              onChange={(v) => set('experience', v)}
              options={(['none', 'some', 'experienced'] as Experience[]).map((v) => ({ value: v, label: EXPERIENCE_LABELS[v] }))}
            />
            <Choice<RiskAppetite>
              label="How do you feel about risk?"
              value={answers.risk_appetite}
              onChange={(v) => set('risk_appetite', v)}
              options={(['low', 'medium', 'high'] as RiskAppetite[]).map((v) => ({ value: v, label: RISK_LABELS[v] }))}
            />
            <Choice<Horizon>
              label="When do you expect to need most of this money?"
              value={answers.horizon}
              onChange={(v) => set('horizon', v)}
              options={(['short', 'medium', 'long'] as Horizon[]).map((v) => ({ value: v, label: HORIZON_LABELS[v] }))}
            />
          </>
        )}

        {step.key === 'review' && (
          <>
            <StepHead icon="fa-clipboard-check" title="Review & save" sub="Here's your Member financial-wellness Index based on your answers." />
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <ScoreRing score={preview.wellness_score} band={preview.wellness_band} size={140} />
              <div style={{ flex: 1, minWidth: 240 }}>
                <PillarBars sub={preview.sub_scores} />
              </div>
            </div>
            <div className="muted2" style={{ fontSize: 12.5, marginTop: 8 }}>
              Risk profile: <strong>{RISK_PROFILE_LABELS[preview.risk_profile]}</strong> · Planning return:{' '}
              <span className="num">{preview.planning_return}%</span> p.a.
            </div>
          </>
        )}

        {/* Nav buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 22 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            style={{ visibility: stepIdx === 0 ? 'hidden' : 'visible' }}
          >
            <i className="fa-solid fa-arrow-left" /> Back
          </button>

          {step.key !== 'review' ? (
            <button
              type="button"
              className="btn btn-lime"
              disabled={!canContinue}
              onClick={() => canContinue && setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
            >
              Continue <i className="fa-solid fa-arrow-right" />
            </button>
          ) : (
            <button type="button" className="btn btn-lime" disabled={saving} onClick={submit}>
              {saving ? 'Saving…' : (
                <>
                  <i className="fa-solid fa-floppy-disk" /> Save my profile
                </>
              )}
            </button>
          )}
        </div>

        {step.key === 'income' && !canContinue && (
          <div className="muted2" style={{ fontSize: 12, marginTop: 10, textAlign: 'right' }}>
            Enter your monthly income to continue.
          </div>
        )}
      </div>
    </div>
  );
}

function StepHead({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 18 }}>
      <div className="grad-purple" style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0 }}>
        <i className={`fa-solid ${icon}`} />
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{title}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          {sub}
        </div>
      </div>
    </div>
  );
}
