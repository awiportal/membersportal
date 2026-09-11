'use client';

// A submit button that asks for confirmation before it actually submits its
// parent <form>. Drop it INSIDE a <form action={serverAction}> in place of the
// destructive submit button: on click it opens a modal, and only on confirm
// does it call form.requestSubmit(), which runs the form's (server) action.
// Works in both server and client components since it is self-contained.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function ConfirmSubmit({
  children,
  className,
  style,
  title = 'Are you sure?',
  body = 'This action cannot be undone.',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  confirmIcon = 'fa-trash',
  danger = true,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmIcon?: string;
  danger?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function doConfirm() {
    setOpen(false);
    // Submit the parent form -> triggers its bound (server) action.
    btnRef.current?.form?.requestSubmit();
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        style={style}
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(0,0,0,.55)',
              backdropFilter: 'blur(2px)',
              padding: 16,
            }}
          >
            <div
              className="card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 430, width: '100%', padding: 20, boxShadow: '0 24px 60px -20px rgba(0,0,0,.6)' }}
            >
              <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
                <span
                  style={{
                    flex: 'none',
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    display: 'grid',
                    placeItems: 'center',
                    background: danger ? 'rgba(239,90,90,.14)' : 'var(--surface2)',
                    color: danger ? '#ef5a5a' : 'var(--lime2)',
                  }}
                >
                  <i className={`fa-solid ${danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}`} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{body}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={doConfirm}
                  style={{ background: danger ? '#ef5a5a' : 'var(--lime2)', color: '#fff', border: 0 }}
                >
                  {confirmIcon ? <i className={`fa-solid ${confirmIcon}`} style={{ marginRight: 6 }} /> : null}
                  {confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
