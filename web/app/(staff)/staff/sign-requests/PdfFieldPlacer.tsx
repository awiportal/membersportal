'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  newFieldId,
  PLACED_FIELD_TYPES,
  type PlacedField,
  type PlacedFieldType,
} from '@/lib/fieldLayout';
import { loadPdfDocument, renderPdfPageToCanvas, type PdfDocProxy } from '@/components/pdfjs';

// Admin builder for VISUAL PDF field placement (PandaDoc-style). After a PDF is
// chosen in the sequential builder, its pages are rendered with pdf.js and the
// admin drops field boxes (signature / name / date / text) onto exact spots,
// each assigned to a signer in the ordered chain. Coordinates are stored
// normalized (0..1, top-left origin) so the same layout renders at any size and
// stamps correctly on completion. All pdf.js usage stays inside this client
// component.

export type PlacerSigner = { key: string; label: string; color: string };

type Props = {
  file: File;
  signers: PlacerSigner[];
  fields: PlacedField[];
  onChange: (fields: PlacedField[]) => void;
};

// Rendering resolution for the page bitmaps. CSS scales them to fit; overlays use
// percentage coordinates so display size never affects the stored geometry.
const RENDER_SCALE = 1.5;

const MIN_W = 0.03;
const MIN_H = 0.02;

const DEFAULT_SIZE: Record<PlacedFieldType, { w: number; h: number }> = {
  signature: { w: 0.26, h: 0.08 },
  name: { w: 0.26, h: 0.045 },
  date: { w: 0.18, h: 0.045 },
  text: { w: 0.26, h: 0.045 },
};

const TYPE_LABEL: Record<PlacedFieldType, string> = {
  signature: 'Signature',
  name: 'Name',
  date: 'Date',
  text: 'Text',
};

const TYPE_ICON: Record<PlacedFieldType, string> = {
  signature: 'fa-signature',
  name: 'fa-user',
  date: 'fa-calendar-day',
  text: 'fa-font',
};

type Drag =
  | { mode: 'create'; page: number; startX: number; startY: number; curX: number; curY: number }
  | { mode: 'move'; id: string; page: number; grabDX: number; grabDY: number }
  | { mode: 'resize'; id: string; page: number };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export default function PdfFieldPlacer({ file, signers, fields, onChange }: Props) {
  const [doc, setDoc] = useState<PdfDocProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tool, setTool] = useState<PlacedFieldType>('signature');
  const [activeSigner, setActiveSigner] = useState<string>(signers[0]?.key ?? 'member');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const overlayRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Always-fresh mirror of the fields so pointer handlers read the latest state.
  const fieldsRef = useRef<PlacedField[]>(fields);
  fieldsRef.current = fields;

  // Load the chosen PDF for rendering.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDoc(null);
    setNumPages(0);
    (async () => {
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const d = await loadPdfDocument(buf);
        if (cancelled) return;
        setDoc(d);
        setNumPages(d.numPages);
      } catch {
        if (!cancelled) setError('Could not open this PDF for field placement.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Render every page into its canvas once the document is loaded.
  useEffect(() => {
    if (!doc || numPages < 1) return;
    let cancelled = false;
    (async () => {
      for (let i = 1; i <= numPages; i++) {
        if (cancelled) return;
        const canvas = canvasRefs.current[i - 1];
        if (!canvas) continue;
        try {
          await renderPdfPageToCanvas(doc, i, canvas, RENDER_SCALE);
        } catch {
          /* skip a page that fails to rasterize */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, numPages]);

  // Keep the active signer valid as the sequence changes.
  useEffect(() => {
    if (signers.length === 0) return;
    if (!signers.some((s) => s.key === activeSigner)) setActiveSigner(signers[0].key);
  }, [signers, activeSigner]);

  const updateField = useCallback(
    (id: string, patch: Partial<PlacedField>) => {
      onChange(fieldsRef.current.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    },
    [onChange]
  );

  const removeField = useCallback(
    (id: string) => {
      onChange(fieldsRef.current.filter((f) => f.id !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [onChange]
  );

  function normPoint(e: React.PointerEvent, el: HTMLDivElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  }

  function signerColor(key: string): string {
    const s = signers.find((x) => x.key === key);
    return s ? s.color : '#94a3b8';
  }
  function signerLabel(key: string): string {
    const s = signers.find((x) => x.key === key);
    return s ? s.label : key;
  }

  // ---- create (drag on empty area) ----
  function onOverlayDown(e: React.PointerEvent<HTMLDivElement>, page: number) {
    if (drag) return;
    if (!activeSigner) return;
    const el = overlayRefs.current[page];
    if (!el) return;
    const p = normPoint(e, el);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setSelectedId(null);
    setDrag({ mode: 'create', page, startX: p.x, startY: p.y, curX: p.x, curY: p.y });
  }

  function onOverlayMove(e: React.PointerEvent<HTMLDivElement>, page: number) {
    if (!drag || drag.page !== page) return;
    const el = overlayRefs.current[page];
    if (!el) return;
    const p = normPoint(e, el);
    if (drag.mode === 'create') {
      setDrag({ ...drag, curX: p.x, curY: p.y });
      return;
    }
    if (drag.mode === 'move') {
      const f = fieldsRef.current.find((ff) => ff.id === drag.id);
      if (!f) return;
      const nx = clamp01(p.x - drag.grabDX);
      const ny = clamp01(p.y - drag.grabDY);
      updateField(drag.id, { x: Math.min(nx, 1 - f.w), y: Math.min(ny, 1 - f.h) });
      return;
    }
    // resize
    const f = fieldsRef.current.find((ff) => ff.id === drag.id);
    if (!f) return;
    const nw = Math.max(MIN_W, Math.min(clamp01(p.x - f.x), 1 - f.x));
    const nh = Math.max(MIN_H, Math.min(clamp01(p.y - f.y), 1 - f.y));
    updateField(drag.id, { w: nw, h: nh });
  }

  function onOverlayUp(e: React.PointerEvent<HTMLDivElement>, page: number) {
    if (!drag) return;
    const el = overlayRefs.current[page];
    try {
      el?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (drag.mode === 'create') commitCreate(drag);
    setDrag(null);
  }

  function commitCreate(d: Extract<Drag, { mode: 'create' }>) {
    let x = Math.min(d.startX, d.curX);
    let y = Math.min(d.startY, d.curY);
    let w = Math.abs(d.curX - d.startX);
    let h = Math.abs(d.curY - d.startY);
    if (w < MIN_W || h < MIN_H) {
      const def = DEFAULT_SIZE[tool];
      w = def.w;
      h = def.h;
      x = clamp01(d.startX - w / 2);
      y = clamp01(d.startY - h / 2);
    }
    if (x + w > 1) x = Math.max(0, 1 - w);
    if (y + h > 1) y = Math.max(0, 1 - h);
    const signerKey = activeSigner || signers[0]?.key || '';
    if (!signerKey) return;
    const field: PlacedField = {
      id: newFieldId(),
      page: d.page,
      x,
      y,
      w: Math.min(w, 1 - x),
      h: Math.min(h, 1 - y),
      type: tool,
      signer_key: signerKey,
      label: TYPE_LABEL[tool],
      required: false,
      value: null,
    };
    onChange([...fieldsRef.current, field]);
    setSelectedId(field.id);
  }

  // ---- move / resize on an existing box ----
  function onBoxDown(e: React.PointerEvent<HTMLDivElement>, f: PlacedField) {
    e.stopPropagation();
    const el = overlayRefs.current[f.page];
    if (!el) return;
    const p = normPoint(e, el);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setSelectedId(f.id);
    setDrag({ mode: 'move', id: f.id, page: f.page, grabDX: p.x - f.x, grabDY: p.y - f.y });
  }

  function onHandleDown(e: React.PointerEvent<HTMLDivElement>, f: PlacedField) {
    e.stopPropagation();
    const el = overlayRefs.current[f.page];
    if (!el) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setSelectedId(f.id);
    setDrag({ mode: 'resize', id: f.id, page: f.page });
  }

  const selected = selectedId ? fields.find((f) => f.id === selectedId) ?? null : null;

  const paletteBtn = (t: PlacedFieldType) => {
    const activeStyle = tool === t;
    return (
      <button
        key={t}
        type="button"
        onClick={() => setTool(t)}
        className="btn btn-sm"
        style={{
          background: activeStyle ? 'var(--purple2, #7c3aed)' : 'var(--surface)',
          color: activeStyle ? '#fff' : 'var(--text)',
          border: '1px solid var(--border)',
        }}
        aria-pressed={activeStyle}
      >
        <i className={`fa-solid ${TYPE_ICON[t]}`} style={{ marginRight: 6 }} />
        {TYPE_LABEL[t]}
      </button>
    );
  };

  return (
    <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: 10,
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface2)',
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PLACED_FIELD_TYPES.map((t) => paletteBtn(t))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>
            for
          </span>
          <select
            className="input"
            value={activeSigner}
            onChange={(e) => setActiveSigner(e.target.value)}
            style={{ width: 190 }}
            aria-label="Signer for placed field"
          >
            {signers.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <span
            title="Colour used for this signer's boxes"
            style={{
              display: 'inline-block',
              width: 16,
              height: 16,
              borderRadius: 4,
              background: signerColor(activeSigner),
              border: '1px solid var(--border)',
            }}
          />
        </div>
      </div>

      <div className="muted" style={{ fontSize: 11.5, padding: '8px 10px 0' }}>
        Pick a field type and signer, then drag on the page to place a box (or click for a default
        size). Drag a box to move it, use the corner handle to resize, and the x to delete. Boxes are
        coloured per signer. The same layout applies to step 1 of every chain in a broadcast.
      </div>

      {/* Selected-field controls */}
      {selected && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
            padding: 10,
            margin: '8px 10px 0',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <span
            className="badge"
            style={{ fontSize: 11, background: signerColor(selected.signer_key), color: '#fff' }}
          >
            {TYPE_LABEL[selected.type]} · {signerLabel(selected.signer_key)}
          </span>
          <input
            className="input"
            value={selected.label}
            onChange={(e) => updateField(selected.id, { label: e.target.value })}
            placeholder="Field label"
            aria-label="Field label"
            style={{ flex: 1, minWidth: 160 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selected.required}
              onChange={(e) => updateField(selected.id, { required: e.target.checked })}
            />
            Required
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => removeField(selected.id)}
            title="Delete field"
          >
            <i className="fa-solid fa-trash" /> Delete
          </button>
        </div>
      )}

      {/* Pages */}
      <div style={{ padding: 10, maxHeight: 620, overflowY: 'auto', background: 'var(--surface)' }}>
        {loading && (
          <div className="muted" style={{ fontSize: 13, padding: 20, textAlign: 'center' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} /> Loading PDF…
          </div>
        )}
        {error && (
          <div className="badge badge-bad" style={{ fontSize: 12 }}>
            <i className="fa-solid fa-circle-exclamation" /> {error}
          </div>
        )}
        {!loading && !error &&
          Array.from({ length: numPages }).map((_, page) => {
            const pageFields = fields.filter((f) => f.page === page);
            const preview =
              drag && drag.mode === 'create' && drag.page === page
                ? {
                    left: Math.min(drag.startX, drag.curX) * 100,
                    top: Math.min(drag.startY, drag.curY) * 100,
                    width: Math.abs(drag.curX - drag.startX) * 100,
                    height: Math.abs(drag.curY - drag.startY) * 100,
                  }
                : null;
            return (
              <div
                key={page}
                style={{
                  position: 'relative',
                  margin: '0 auto 14px',
                  width: '100%',
                  maxWidth: 760,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                  background: '#fff',
                }}
              >
                <canvas
                  ref={(el) => {
                    canvasRefs.current[page] = el;
                  }}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
                <div
                  ref={(el) => {
                    overlayRefs.current[page] = el;
                  }}
                  onPointerDown={(e) => onOverlayDown(e, page)}
                  onPointerMove={(e) => onOverlayMove(e, page)}
                  onPointerUp={(e) => onOverlayUp(e, page)}
                  style={{ position: 'absolute', inset: 0, cursor: 'crosshair', touchAction: 'none' }}
                >
                  {pageFields.map((f) => {
                    const color = signerColor(f.signer_key);
                    const isSel = f.id === selectedId;
                    return (
                      <div
                        key={f.id}
                        onPointerDown={(e) => onBoxDown(e, f)}
                        style={{
                          position: 'absolute',
                          left: `${f.x * 100}%`,
                          top: `${f.y * 100}%`,
                          width: `${f.w * 100}%`,
                          height: `${f.h * 100}%`,
                          border: `2px solid ${color}`,
                          background: `${color}22`,
                          borderRadius: 3,
                          boxSizing: 'border-box',
                          cursor: 'move',
                          outline: isSel ? '2px solid rgba(0,0,0,0.35)' : 'none',
                          overflow: 'visible',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            top: -16,
                            left: 0,
                            fontSize: 9.5,
                            lineHeight: '14px',
                            padding: '0 4px',
                            background: color,
                            color: '#fff',
                            borderRadius: 3,
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                            maxWidth: 180,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {f.required ? '* ' : ''}
                          {f.label || TYPE_LABEL[f.type]}
                        </span>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeField(f.id);
                          }}
                          title="Delete field"
                          style={{
                            position: 'absolute',
                            top: -9,
                            right: -9,
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            border: 'none',
                            background: '#ef4444',
                            color: '#fff',
                            fontSize: 10,
                            lineHeight: '18px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                        <div
                          onPointerDown={(e) => onHandleDown(e, f)}
                          title="Resize"
                          style={{
                            position: 'absolute',
                            right: -6,
                            bottom: -6,
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            background: color,
                            border: '1px solid #fff',
                            cursor: 'nwse-resize',
                          }}
                        />
                      </div>
                    );
                  })}
                  {preview && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${preview.left}%`,
                        top: `${preview.top}%`,
                        width: `${preview.width}%`,
                        height: `${preview.height}%`,
                        border: `2px dashed ${signerColor(activeSigner)}`,
                        background: `${signerColor(activeSigner)}18`,
                        borderRadius: 3,
                        boxSizing: 'border-box',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
