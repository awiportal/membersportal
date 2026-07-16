'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KES } from '@/lib/format';
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
  projected_monthly: number | null;
  projected_rate: number | null;
};

const EMPTY_FORM: GoalInput = {
  name: '',
  category: 'Other',
  priority: 'Medium',
  target_amount: 0,
  saved_amount: 0,
  target_date: null,
};

function fmtMonth(d: string): string {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
  } catch {
    return d;
  }
}

function priorityClass(p?: string | null): string {
  if (p === 'High') return 'badge-purple';
  if (p === 'Low') return 'badge-info';
  return 'badge-lime';
}

const TONE_COLOR: Record<string, string> = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  lime: 'var(--lime2)',
  muted: 'var(--muted2)',
};

function projectionLine(g: Goal, rate: number, hasProfile: boolean) {
  const target = Number(g.target_amount) || 0;
  const saved = Number(g.saved_amount) || 0;
  const proj = projectGoal({ target, saved, targetDate: g.target_date, annualRatePct: rate });
  if (proj.reached) return { icon: 'fa-circle-check', tone: 'good', text: 'Goal reached — nicely done.' };
  if (!g.target_date) return { icon: 'fa-calendar-plus', tone: 'muted', text: 'Add a target date to see your monthly savings plan.' };
  if (proj.overdue) return { icon: 'fa-triangle-exclamation', tone: 'warn', text: 'The target date has passed. Update the date or amount for a fresh plan.' };
  if (proj.metByGrowth) return { icon: 'fa-seedling', tone: 'good', text: `On track — your current savings should reach this by ${fmtMonth(g.target_date)}.` };
  const rateBit = hasProfile ? `your ${rate}% p.a. planning return` : `an assumed ${rate}% p.a.`;
  return {
    icon: 'fa-piggy-bank',
    tone: 'lime',
    text: `Save about ${KES(proj.requiredMonthly || 0)} a month to reach this by ${fmtMonth(g.target_date)}, at ${rateBit}.`,
  };
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

  const totals = useMemo(() => {
    const target = goals.reduce((s, g) => s + (Number(g.target_amount) || 0), 0);
    const saved = goals.reduce((s, g) => s + (Number(g.saved_amount) || 0), 0);
    return { target, saved, pct: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0 };
  }, [goals]);

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
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">Goal Tracker</div>
          <div className="sub">Set savings and investment goals, then see the monthly plan to reach each one.</div>
        </div>
        <button type="button" className="btn btn-lime" onClick={openNew}>
          <i className="fa-solid fa-plus" /> New goal
        </button>
      </div>

      {!hasProfile && (
        <div className="card card-pad" style={{ marginTop: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', border: '1px solid rgba(166,205,53,0.3)' }}>
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

      {goals.length > 0 && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {goals.length} goal{goals.length === 1 ? '' : 's'} · {KES(totals.saved)} of {KES(totals.target)} saved
            </div>
            <div className="badge badge-lime">{totals.pct}% overall</div>
          </div>
          <div className="bar">
            <span style={{ width: `${totals.pct}%` }} />
          </div>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="card card-pad" style={{ marginTop: 16, textAlign: 'center', padding: '56px 24px' }}>
          <div className="grad-purple" style={{ width: 68, height: 68, borderRadius: 20, margin: '0 auto 16px', display: 'grid', placeItems: 'center', color: '#fff' }}>
            <i className="fa-solid fa-bullseye" style={{ fontSize: 26 }} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 19 }}>Set your first goal</div>
          <p className="muted" style={{ fontSize: 14, maxWidth: 440, margin: '10px auto 20px', lineHeight: 1.6 }}>
            Whether it&apos;s a home, education, or building your investment pot — name your goal and we&apos;ll show you the
            monthly plan to get there.
          </p>
          <button type="button" className="btn btn-lime" onClick={openNew}>
            <i className="fa-solid fa-plus" /> New goal
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', marginTop: 16 }}>
          {goals.map((g) => {
            const target = Number(g.target_amount) || 0;
            const saved = Number(g.saved_amount) || 0;
            const pctv = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
            const line = projectionLine(g, planningReturn, hasProfile);
            const isDeleting = deletingId === g.id;
            return (
              <div key={g.id} className="card card-pad hover-lift" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{g.name}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {g.category && <span className="badge">{g.category}</span>}
                      {g.priority && <span className={`badge ${priorityClass(g.priority)}`}>{g.priority}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="icon-btn" style={{ width: 34, height: 34 }} title="Edit" onClick={() => openEdit(g)}>
                      <i className="fa-solid fa-pen" style={{ fontSize: 12 }} />
                    </button>
                    <button type="button" className="icon-btn" style={{ width: 34, height: 34 }} title="Remove" onClick={() => setDeletingId(g.id)}>
                      <i className="fa-solid fa-trash" style={{ fontSize: 12 }} />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="bar">
                    <span style={{ width: `${pctv}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12.5 }} className="muted num">
                    <span>{KES(saved)}</span>
                    <span>{pctv}% of {KES(target)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.5 }}>
                  <i className={`fa-solid ${line.icon}`} style={{ color: TONE_COLOR[line.tone], marginTop: 2 }} />
                  <span style={{ color: line.tone === 'muted' ? 'var(--muted)' : 'var(--text)' }}>{line.text}</span>
                </div>

                {isDeleting && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
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
          <div
            className="card card-pad"
            style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
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
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                <select className="input" value={form.priority} onChange={(e) => setF('priority', e.target.value)}>
                  {GOAL_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Target amount (KES)</label>
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.target_amount ? String(form.target_amount) : ''}
                  onChange={(e) => setF('target_amount', Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
                  placeholder="0"
                />
              </div>
              <div className="field">
                <label>Saved so far (KES)</label>
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.saved_amount ? String(form.saved_amount) : ''}
                  onChange={(e) => setF('saved_amount', Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="field">
              <label>Target date</label>
              <input
                className="input"
                type="date"
                value={form.target_date || ''}
                onChange={(e) => setF('target_date', e.target.value || null)}
              />
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
