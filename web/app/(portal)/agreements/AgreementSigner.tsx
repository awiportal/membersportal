'use client';

import { useRef, useState } from 'react';
import { signAgreementDoc } from './actions';

// Signature block for an unsigned agreement: full name, the signing date, and a
// signature the member can either draw (mouse / finger) or upload as an image.
// The signature is captured as a compact data URL in a hidden field and stored
// by the server action; typed name + date are always recorded for the audit
// trail even if no signature image is provided.
export default function AgreementSigner({ agreementId }: { agreementId: string }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [sig, setSig] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}
    drawing.current = true;
    const ctx = c.getContext('2d')!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#141414';
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dirty.current = true;
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    const c = canvasRef.current;
    if (c && dirty.current) setSig(c.toDataURL('image/png'));
  }
  function clearCanvas() {
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
    }
    dirty.current = false;
    setSig('');
  }
  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { alert('Please choose an image file.'); return; }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      // Downscale to keep the stored data URL small (server action body limit).
      const maxW = 900;
      const scale = Math.min(1, maxW / img.width);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      setSig(cv.toDataURL('image/jpeg', 0.85));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { alert('Could not read that image.'); URL.revokeObjectURL(url); };
    img.src = url;
  }

  const canSubmit = name.trim().length > 1;

  return (
    <form action={signAgreementDoc} style={{ marginTop: 14, display: 'grid', gap: 14 }}>
      <input type="hidden" name="agreement_id" value={agreementId} />
      <input type="hidden" name="signature_image" value={sig} />
      <input type="hidden" name="signature_kind" value={sig ? mode : ''} />

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Full name</label>
          <input className="input" name="signed_name" placeholder="Your full name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Date</label>
          <input className="input" value={today} readOnly aria-readonly="true" tabIndex={-1} style={{ opacity: 0.85, cursor: 'default' }} />
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>Signature</label>
          <div className="tabs" style={{ padding: 3 }}>
            <button type="button" className={'tab ' + (mode === 'draw' ? 'active' : '')} onClick={() => { setMode('draw'); clearCanvas(); }}>
              <i className="fa-solid fa-pen-nib" style={{ marginRight: 6 }} />Draw
            </button>
            <button type="button" className={'tab ' + (mode === 'upload' ? 'active' : '')} onClick={() => { setMode('upload'); setSig(''); }}>
              <i className="fa-solid fa-upload" style={{ marginRight: 6 }} />Upload
            </button>
          </div>
        </div>

        {mode === 'draw' ? (
          <div>
            <canvas
              ref={canvasRef}
              width={720}
              height={200}
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerLeave={end}
              style={{ width: '100%', height: 170, touchAction: 'none', borderRadius: 12, border: '1px dashed var(--border2)', background: '#ffffff', cursor: 'crosshair', display: 'block' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 7, gap: 8, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 11.5 }}>Sign in the box above using your mouse or finger.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearCanvas}><i className="fa-solid fa-eraser" /> Clear</button>
            </div>
          </div>
        ) : (
          <div style={{ borderRadius: 12, border: '1px dashed var(--border2)', background: 'var(--surface2)', padding: 16, display: 'grid', gap: 12, placeItems: 'center' }}>
            {sig ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sig} alt="Signature preview" style={{ maxHeight: 130, maxWidth: '100%', background: '#ffffff', borderRadius: 8, padding: 8 }} />
            ) : (
              <div className="muted" style={{ fontSize: 12.5, textAlign: 'center', lineHeight: 1.6 }}>
                Upload a photo or scan of your handwritten signature.<br />PNG or JPG, up to a few MB (it is compressed automatically).
              </div>
            )}
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
              <i className="fa-solid fa-image" /> {sig ? 'Choose a different image' : 'Choose image'}
              <input type="file" accept="image/*" onChange={onUpload} style={{ display: 'none' }} />
            </label>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-lime btn-sm" type="submit" disabled={!canSubmit}>
          <i className="fa-solid fa-signature" /> Sign &amp; submit
        </button>
        <span className="muted" style={{ fontSize: 11.5, flex: 1, minWidth: 200 }}>
          By signing you accept this document. Your name and today&apos;s date ({today}) are recorded for the audit trail; the signature image is optional.
        </span>
      </div>
    </form>
  );
}
