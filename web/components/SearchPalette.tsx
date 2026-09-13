'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NAV } from '@/lib/nav';
import { PENDING_ALLOWED_NAV } from '@/lib/pendingAccess';

type Dest = { id: string; label: string; icon: string; group: string; href: string };

// Lightweight command-palette search over every portal destination. Opens from
// the top-bar search box (desktop) or the search icon (mobile). It searches
// page names/sections and navigates on select or Enter — no backend needed.
export default function SearchPalette({
  open,
  onClose,
  isActive,
}: {
  open: boolean;
  onClose: () => void;
  isActive: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // All reachable destinations, respecting the pending-member gate so we never
  // point a not-yet-approved member at a page that would just bounce them.
  const dests = useMemo<Dest[]>(() => {
    const out: Dest[] = [];
    for (const g of NAV) {
      for (const it of g.items) {
        if (!isActive && !PENDING_ALLOWED_NAV.has(it.id)) continue;
        const href =
          it.id === 'dashboard'
            ? '/dashboard'
            : it.id === 'kyc'
              ? isActive
                ? '/kyc'
                : '/onboarding'
              : `/${it.id}`;
        out.push({ id: it.id, label: it.label, icon: it.icon, group: g.group, href });
      }
    }
    return out;
  }, [isActive]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return dests;
    return dests.filter(
      (d) =>
        d.label.toLowerCase().includes(s) ||
        d.group.toLowerCase().includes(s) ||
        d.id.includes(s),
    );
  }, [q, dests]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <div
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onClick={onClose}
    >
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <form
          className="search-panel-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (results[0]) go(results[0].href);
          }}
        >
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages…"
            aria-label="Search pages"
          />
          <button type="button" className="icon-btn" aria-label="Close search" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </form>
        <div className="search-results">
          {results.length === 0 ? (
            <div className="search-empty muted">No pages match “{q}”.</div>
          ) : (
            results.map((d) => (
              <button
                key={d.id}
                type="button"
                className="search-result"
                onClick={() => go(d.href)}
              >
                <i className={`fa-solid ${d.icon}`} aria-hidden="true" />
                <span className="search-result-label">{d.label}</span>
                <span className="search-result-group muted">{d.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
