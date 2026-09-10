"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type FancyOption = { value: string; label: string; keywords?: string };

// A custom, searchable dropdown that replaces the native <select> popup.
// Native popups are drawn by the OS, so their scrollbar cannot be styled and
// long lists (years, countries) are painful on a dark theme. This one gives us
// a visible scrollbar, type-to-filter search, and keyboard navigation.
export default function FancySelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  ariaLabel,
  name,
  searchable,
  searchPlaceholder = "Type to search...",
  disabled = false,
}: {
  options: FancyOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  name?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [dropUp, setDropUp] = useState(false);

  const canSearch = searchable === undefined ? options.length > 12 : searchable;
  const selected = options.find((o) => o.value === value) || null;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s === "") return options;
    return options.filter((o) =>
      (o.label + " " + (o.keywords || "")).toLowerCase().includes(s)
    );
  }, [q, options]);

  function closeMenu() {
    setOpen(false);
    setQ("");
  }
  function pick(v: string) {
    onChange(v);
    closeMenu();
  }
  function toggle() {
    if (disabled) return;
    if (open) closeMenu();
    else setOpen(true);
  }

  useEffect(() => {
    if (open === false) return;
    function onDoc(e: MouseEvent) {
      const root = rootRef.current;
      if (root && root.contains(e.target as Node) === false) closeMenu();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open === false) return;
    const idx = options.findIndex((o) => o.value === value);
    setActive(idx >= 0 ? idx : 0);
    const root = rootRef.current;
    if (root) {
      const r = root.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      setDropUp(below < 300 && r.top > below);
    }
    const t = setTimeout(() => {
      if (canSearch && searchRef.current) searchRef.current.focus();
    }, 10);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open === false) return;
    const list = listRef.current;
    if (list === null) return;
    const el = list.querySelector<HTMLElement>('[data-i="' + active + '"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function onKey(e: React.KeyboardEvent) {
    if (open === false) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[active];
      if (o) pick(o.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    }
  }

  return (
    <div className="fsel" ref={rootRef} onKeyDown={onKey}>
      <button
        type="button"
        className={"input fsel-trigger" + (open ? " fsel-open" : "")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggle}
      >
        <span className={selected ? "fsel-val" : "fsel-ph"}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className="fsel-chev" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div className={"fsel-pop" + (dropUp ? " fsel-up" : "")} role="listbox">
          {canSearch ? (
            <div className="fsel-search">
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                placeholder={searchPlaceholder}
                aria-label="Search"
              />
            </div>
          ) : null}
          <div className="fsel-list" ref={listRef}>
            {filtered.length === 0 ? (
              <div className="fsel-empty">No matches</div>
            ) : (
              filtered.map((o, i) => (
                <div
                  key={o.value}
                  data-i={i}
                  role="option"
                  aria-selected={o.value === value}
                  className={
                    "fsel-opt" +
                    (i === active ? " is-active" : "") +
                    (o.value === value ? " is-sel" : "")
                  }
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o.value);
                  }}
                >
                  <span className="fsel-opt-lbl">{o.label}</span>
                  {o.value === value ? (
                    <svg className="fsel-check" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 12l5 5L20 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
