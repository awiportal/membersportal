'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitForm } from '../actions';

export type FormField = { label: string; type?: string; required?: boolean; options?: string[] };

export default function FormFill({
  formId,
  fields,
  requireSignature,
  existingAnswers,
}: {
  formId: string;
  fields: FormField[];
  requireSignature: boolean;
  existingAnswers: Record<string, unknown>;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, unknown>>(existingAnswers || {});
  const [typedName, setTypedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  function setVal(label: string, v: unknown) {
    setAnswers((a) => ({ ...a, [label]: v }));
  }

  function coords(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = coords(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = coords(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = '#f6f3f8';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    hasDrawn.current = true;
  }
  function up() {
    drawing.current = false;
  }
  function clearSig() {
    const c = canvasRef.current;
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    hasDrawn.current = false;
  }

  async function onSubmit() {
    setError(null);
    // Enforce required text fields.
    const missing = fields.find((f) => f.required && !String(answers[f.label] ?? '').trim());
    if (missing) {
      setError(`Please complete: ${missing.label}`);
      return;
    }
    if (requireSignature && !hasDrawn.current && !typedName.trim()) {
      setError('Please sign — draw your signature or type your full name.');
      return;
    }
    setBusy(true);
    let dataUrl: string | null = null;
    if (requireSignature && hasDrawn.current && canvasRef.current) {
      dataUrl = canvasRef.current.toDataURL('image/png');
    }
    const res = await submitForm(formId, answers, dataUrl, typedName.trim() || null);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || 'Could not submit the form. Please try again.');
      return;
    }
    router.push('/forms');
    router.refresh();
  }

  return (
    <div className="card card-pad" style={{ marginTop: 16 }}>
      {fields.length === 0 && <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>This form has no additional fields — sign and submit below.</div>}

      {fields.map((f, i) => {
        const val = String(answers[f.label] ?? '');
        const type = (f.type || 'text').toLowerCase();
        return (
          <div className="field" key={i}>
            <label>{f.label}{f.required ? ' *' : ''}</label>
            {type === 'textarea' ? (
              <textarea className="input" rows={3} value={val} onChange={(e) => setVal(f.label, e.target.value)} />
            ) : type === 'select' ? (
              <select className="input" value={val} onChange={(e) => setVal(f.label, e.target.value)}>
                <option value="">Select…</option>
                {(f.options || []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
                value={val}
                onChange={(e) => setVal(f.label, e.target.value)}
              />
            )}
          </div>
        );
      })}

      {requireSignature && (
        <div className="field">
          <label>Signature — draw below, or type your full name</label>
          <canvas
            ref={canvasRef}
            width={600}
            height={160}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            style={{ width: '100%', height: 160, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface2)', touchAction: 'none', cursor: 'crosshair' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearSig}><i className="fa-solid fa-eraser" /> Clear</button>
            <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="or type your full name" value={typedName} onChange={(e) => setTypedName(e.target.value)} />
          </div>
        </div>
      )}

      {error && <div style={{ color: 'var(--bad)', fontSize: 13, marginTop: 6 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
        <button className="btn btn-lime" type="button" onClick={onSubmit} disabled={busy}>
          <i className="fa-solid fa-paper-plane" /> {busy ? 'Submitting…' : 'Submit form'}
        </button>
      </div>
    </div>
  );
}
