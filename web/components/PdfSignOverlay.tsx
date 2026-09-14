'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlacedField } from '@/lib/fieldLayout';
import { loadPdfDocument, renderPdfPageToCanvas, type PdfDocProxy } from '@/components/pdfjs';

// Signing-side overlay for VISUAL PDF field placement. Renders the original PDF
// with pdf.js and overlays ONLY the active signer's placed boxes as inline inputs
// at their exact coordinates:
//   text -> text input, date -> date input, name -> text input (prefilled with
//   the signer's name), signature -> a preview bound to the shared signature
//   capture (the existing SignaturePad below the overlay).
// Typed values are reported up via onChange keyed by field id; the signature image
// itself is captured by SignaturePad and stamped at completion. All pdf.js usage
// stays inside this client component.

type Props = {
  originalUrl: string;
  fields: PlacedField[]; // this signer's fields only
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  // Current captured signature data URL (or '') so signature boxes preview it.
  signatureDataUrl: string;
  signerName: string;
};

const RENDER_SCALE = 1.5;

export default function PdfSignOverlay({
  originalUrl,
  fields,
  values,
  onChange,
  signatureDataUrl,
  signerName,
}: Props) {
  const [doc, setDoc] = useState<PdfDocProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const valuesRef = useRef<Record<string, string>>(values);
  valuesRef.current = values;

  // Fetch + open the original PDF (same-origin, authenticated route).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDoc(null);
    setNumPages(0);
    (async () => {
      try {
        const res = await fetch(originalUrl, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        const d = await loadPdfDocument(buf);
        if (cancelled) return;
        setDoc(d);
        setNumPages(d.numPages);
      } catch {
        if (!cancelled) setError('Could not load the document preview. You can still sign below.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [originalUrl]);

  // Render each page into its canvas.
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

  function setValue(id: string, v: string) {
    onChange({ ...valuesRef.current, [id]: v });
  }

  return (
    <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div className="muted" style={{ fontSize: 11.5, padding: '8px 10px' }}>
        <i className="fa-solid fa-hand-pointer" style={{ marginRight: 6 }} />
        Fill in the highlighted fields on the document below. Your signature (captured under the
        document) is placed in each signature box automatically.
      </div>
      <div style={{ padding: 10, maxHeight: 560, overflowY: 'auto', background: 'var(--surface)' }}>
        {loading && (
          <div className="muted" style={{ fontSize: 13, padding: 20, textAlign: 'center' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} /> Loading document…
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
                <div style={{ position: 'absolute', inset: 0 }}>
                  {pageFields.map((f) => {
                    const boxStyle: React.CSSProperties = {
                      position: 'absolute',
                      left: `${f.x * 100}%`,
                      top: `${f.y * 100}%`,
                      width: `${f.w * 100}%`,
                      height: `${f.h * 100}%`,
                      boxSizing: 'border-box',
                    };
                    if (f.type === 'signature') {
                      return (
                        <div
                          key={f.id}
                          style={{
                            ...boxStyle,
                            border: '2px dashed #7c3aed',
                            background: signatureDataUrl ? '#ffffff' : 'rgba(124,58,237,0.10)',
                            borderRadius: 3,
                            display: 'grid',
                            placeItems: 'center',
                            overflow: 'hidden',
                          }}
                          title={f.label || 'Signature'}
                        >
                          {signatureDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={signatureDataUrl}
                              alt="Your signature"
                              style={{ maxWidth: '96%', maxHeight: '90%', objectFit: 'contain' }}
                            />
                          ) : (
                            <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>
                              <i className="fa-solid fa-signature" /> {f.required ? 'Signature *' : 'Signature'}
                            </span>
                          )}
                        </div>
                      );
                    }
                    const inputType = f.type === 'date' ? 'date' : 'text';
                    return (
                      <input
                        key={f.id}
                        type={inputType}
                        value={values[f.id] ?? ''}
                        required={f.required}
                        onChange={(e) => setValue(f.id, e.target.value)}
                        onPointerDown={(e) => e.stopPropagation()}
                        placeholder={f.label || (f.type === 'name' ? 'Name' : f.type === 'date' ? 'Date' : 'Text')}
                        aria-label={f.label || f.type}
                        style={{
                          ...boxStyle,
                          border: `2px solid ${f.required ? '#d97706' : '#2563eb'}`,
                          background: 'rgba(255,255,255,0.92)',
                          borderRadius: 3,
                          fontSize: 12,
                          padding: '0 3px',
                          color: '#0b1220',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
