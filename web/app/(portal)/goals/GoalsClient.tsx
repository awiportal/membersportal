'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KES, KESc } from '@/lib/format';
import { projectGoal, GOAL_CATEGORIES, GOAL_PRIORITIES, type GoalInput } from '@/lib/goals';
import { saveGoal, deleteGoal } from './actions';

type Goal = {
  id: string;
  name: string;
  category: string | null;
  priority: string | null;
  target_amount: number | string;
  saved_amount: number | string;
  target_date: string | null;
};

const EMPTY_FORM: GoalInput = {
  name: '',
  category: 'Other',
  priority: 'Medium',
  target_amount: 0,
  saved_amount: 0,
  target_date: null,
};

const CAT_ICON: Record<string, string> = {
  Retirement: 'fa-umbrella-beach',
  Home: 'fa-house',
  Education: 'fa-graduation-cap',
  Business: 'fa-briefcase',
  'Emergency fund': 'fa-shield-heart',
  Travel: 'fa-plane',
  Vehicle: 'fa-car',
  Other: 'fa-bullseye',
};

function fmtMonth(d: string): string {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

function priorityClass(p?: string | null): string {
  if (p === 'High' || p === 'Very high') return 'badge-purple';
  if (p === 'Low') return 'badge-info';
  return 'badge-lime';
}

function GoalRing({ pct, done }: { pct: number; done: boolean }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const off = C - (pct / 100) * C;
  return (
    <div style={{ position: 'relative', width: 120, height: 120, flex: 'none' }}>
      <svg width={120} height={120} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={60} cy={60} r={R} fill="none" stroke="var(--surface2)" strokeWidth={10} />
        <circle
          cx={60}
          cy={60}
          r={R}
          fill="none"
          stroke={done ? '#37c98a' : 'url(#gwell)'}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{pct}%</div>
      </div>
    </div>
  );
}

export default function GoalsClient({
  goals,
  planningReturn,
  riskProfile,
  hasProfile,
}: {
  goals: Goal[];
  planningReturn: number;
  riskProfile: string | null;
  hasProfile: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<null | 'new' | string>(null);
  const [form, setForm] = useState<GoalInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const stats = useMemo(() => {
    let target = 0;
    let saved = 0;
    let monthly = 0;
    let reached = 0;
    let onTrack = 0;
    for (const g of goals) {
      const t = Number(g.target_amount) || 0;
      const s = Number(g.saved_amount) || 0;
      target += t;
      saved += s;
      const proj = projectGoal({ target: t, saved: s, targetDate: g.target_date, annualRatePct: planningReturn });
      if (proj.requiredMonthly && proj.requiredMonthly > 0) monthly += proj.requiredMonthly;
      if (proj.reached) reached += 1;
      if (proj.reached || (g.target_date && !proj.overdue)) onTrack += 1;
    }
    return {
      count: goals.length,
      target,
      saved,
      monthly,
      reached,
      onTrack,
      onTrackPct: goals.length ? Math.round((onTrack / goals.length) * 100) : 0,
    };
  }, [goals, planningReturn]);

  function openNew() {
    setForm(EMPTY_FORM);
    setError(null);
    setEditing('new');
  }
  function openEdit(g: Goal) {
    setForm({
      id: g.id,
      name: g.name || '',
      category: g.category || 'Other',
      priority: g.priority || 'Medium',
      target_amount: Number(g.target_amount) || 0,
      saved_amount: Number(g.saved_amount) || 0,
      target_date: g.target_date || null,
    });
    setError(null);
    setEditing(g.id);
  }
  function close() {
    setEditing(null);
    setError(null);
  }
  async function submit() {
    setSaving(true);
    setError(null);
    const res = await saveGoal(form);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    close();
    router.refresh();
  }
  async function confirmDelete(id: string) {
    setBusyId(id);
    const res = await deleteGoal(id);
    setBusyId(null);
    setDeletingId(null);
    if (!res.error) router.refresh();
  }

  const setF = <K extends keyof GoalInput>(k: K, v: GoalInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const preview = projectGoal({
    target: Number(form.target_amount) || 0,
    saved: Number(form.saved_amount) || 0,
    targetDate: form.target_date,
    annualRatePct: planningReturn,
  });

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      {/* Shared ring gradient */}
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <linearGradient id="gwell" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c3e05f" />
            <stop offset="100%" stopColor="#a6cd35" />
          </linearGradient>
        </defs>
      </svg>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div className="page-title">Goal Tracker</div>
          <div className="sub">Set targets, track progress and see exactly what to save each month.</div>
        </div>
        <button type="button" className="btn btn-lime" onClick={openNew}>
          <i className="fa-solid fa-plus" /> Add goal
        </button>
      </div>

      {!hasProfile && (
        <div className="card card-pad" style={{ marginBottom: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', border: '1px solid rgba(166,205,53,0.3)' }}>
          <div className="grad-lime" style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', color: '#20260a', flexShrink: 0 }}>
            <i className="fa-solid fa-heart-pulse" />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700 }}>Personalise your projections</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Complete your Financial Profile so goals use your own planning return. Until then we assume {planningReturn}% p.a.
            </div>
          </div>
          <Link href="/financial-profile" className="btn btn-ghost">
            Complete profile <i className="fa-solid fa-arrow-right" />
          </Link>
        </div>
      )}

      {/* KPI summary */}
      {stats.count > 0 && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', marginBottom: 16 }}>
          <div className="card kpi hover-lift">
            <span className="lbl">Active goals</span>
            <div className="val num">{stats.count}</div>
            <span className="muted" style={{ fontSize: 12, marginTop: 8 }}>{stats.reached} completed</span>
          </div>
          <div className="card kpi hover-lift">
            <span className="lbl">On track</span>
            <div className="val num grad-text">{stats.onTrack} of {stats.count}</div>
            <span className="badge badge-good" style={{ width: 'fit-content', marginTop: 8 }}>{stats.onTrackPct}%</span>
          </div>
          <div className="card kpi hover-lift">
            <span className="lbl">Total target</span>
            <div className="val num">{KESc(stats.target)}</div>
          </div>
          <div className="card kpi hover-lift">
            <span className="lbl">Monthly needed</span>
            <div className="val num">{KESc(stats.monthly)}</div>
            <span className="muted" style={{ fontSize: 12, marginTop: 8 }}>Across all goals</span>
          </div>
        </div>
      )}

      {stats.count === 0 ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '56px 24px' }}>
          <div className="grad-purple" style={{ width: 68, height: 68, borderRadius: 20, margin: '0 auto 16px', display: 'grid', placeItems: 'center', color: '#fff' }}>
            <i className="fa-solid fa-bullseye" style={{ fontSize: 26 }} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 19 }}>Set your first goal</div>
          <p className="muted" style={{ fontSize: 14, maxWidth: 440, margin: '10px auto 20px', lineHeight: 1.6 }}>
            Whether it&apos;s a home, education, or building your investment pot — name your goal and we&apos;ll show you the
            monthly plan to get there.
          </p>
          <button type="button" className="btn btn-lime" onClick={openNew}>
            <i className="fa-solid fa-plus" /> Add goal
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
          {goals.map((g) => {
            const target = Number(g.target_amount) || 0;
            const saved = Number(g.saved_amount) || 0;
            const proj = projectGoal({ target, saved, targetDate: g.target_date, annualRatePct: planningReturn });
            const pctv = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
            const done = proj.reached;
            const icon = CAT_ICON[g.category || 'Other'] || 'fa-bullseye';
            const perMonth = done
              ? '—'
              : proj.requiredMonthly && proj.requiredMonthly > 0
              ? KES(proj.requiredMonthly)
              : proj.metByGrowth
              ? 'On track'
              : !g.target_date
              ? 'Set a date'
              : proj.overdue
              ? 'Overdue'
              : '—';
            const isDeleting = deletingId === g.id;
            return (
              <div key={g.id} className="card card-pad hover-lift">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center', background: 'var(--surface2)', flexShrink: 0 }}>
                      <i className={`fa-solid ${icon}`} style={{ color: 'var(--lime2)' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{g.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {g.category || 'Other'}{g.target_date ? ` · by ${fmtMonth(g.target_date)}` : ''}
                      </div>
                    </div>
                  </div>
                  <span className={`badge ${done ? 'badge-good' : priorityClass(g.priority)}`}>{done ? 'Complete' : g.priority || 'Medium'}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <GoalRing pct={pctv} done={done} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12.5 }}>
                      <span className="muted">Saved</span>
                      <span className="num" style={{ fontWeight: 600 }}>{KESc(saved)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12.5 }}>
                      <span className="muted">Target</span>
                      <span className="num" style={{ fontWeight: 600 }}>{KESc(target)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span className="muted">Per month</span>
                      <span className="num" style={{ fontWeight: 600, color: 'var(--lime2)' }}>{perMonth}</span>
                    </div>
                  </div>
                </div>

                {!isDeleting ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => openEdit(g)}>
                      <i className="fa-solid fa-pen" /> Edit
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeletingId(g.id)} title="Remove">
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <span className="muted" style={{ fontSize: 12.5, marginRight: 'auto' }}>Remove this goal?</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeletingId(null)} disabled={busyId === g.id}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-sm" style={{ background: 'var(--bad)', color: '#fff' }} onClick={() => confirmDelete(g.id)} disabled={busyId === g.id}>
                      {busyId === g.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / edit modal */}
      {editing && (
        <div className="scrim" style={{ display: 'grid', placeItems: 'center', padding: 16, zIndex: 80 }} onClick={close}>
          <div className="card card-pad" style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{editing === 'new' ? 'New goal' : 'Edit goal'}</div>
              <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} onClick={close}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {error && (
              <div className="badge badge-bad" style={{ marginBottom: 14 }}>
                <i className="fa-solid fa-circle-exclamation" /> {error}
              </div>
            )}

            <div className="field">
              <label>Goal name</label>
              <input className="input" autoFocus value={form.name} onChange={(e) => setF('name', e.target.value)} placeholder="e.g. Family home deposit" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Category</label>
                <select className="input" value={form.category} onChange={(e) => setF('category', e.target.value)}>
                  {GOAL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                <select className="input" value={form.priority} onChange={(e) => setF('priority', e.target.value)}>
                  {GOAL_PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Target amount (KES)</label>
                <input className="input" inputMode="numeric" value={form.target_amount ? String(form.target_amount) : ''} onChange={(e) => setF('target_amount', Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)} placeholder="0" />
              </div>
              <div className="field">
                <label>Saved so far (KES)</label>
                <input className="input" inputMode="numeric" value={form.saved_amount ? String(form.saved_amount) : ''} onChange={(e) => setF('saved_amount', Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)} placeholder="0" />
              </div>
            </div>

            <div className="field">
              <label>Target date</label>
              <input className="input" type="date" value={form.target_date || ''} onChange={(e) => setF('target_date', e.target.value || null)} />
            </div>

            {(Number(form.target_amount) || 0) > 0 && (
              <div className="card" style={{ background: 'var(--surface2)', padding: '12px 14px', marginBottom: 4, fontSize: 12.5 }}>
                <i className="fa-solid fa-wand-magic-sparkles" style={{ color: 'var(--lime2)' }} />{' '}
                {preview.reached
                  ? ' This goal is already fully funded.'
                  : !form.target_date
                  ? ' Add a target date to see the monthly plan.'
                  : preview.overdue
                  ? ' That date is in the past — pick a future date.'
                  : preview.metByGrowth
                  ? ` Your current savings should reach this by ${fmtMonth(form.target_date)}.`
                  : ` Plan: about ${KES(preview.requiredMonthly || 0)} a month at ${planningReturn}% p.a.`}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={close} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn btn-lime" onClick={submit} disabled={saving}>
                {saving ? 'Saving…' : editing === 'new' ? 'Create goal' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
