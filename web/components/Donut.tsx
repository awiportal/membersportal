"use client";

import { useEffect, useState } from "react";

// Dependency-free SVG donut with hover highlighting, a live center readout, and
// a mount animation. Client component (needs hover state); prop signature is
// unchanged so every existing caller keeps working.
export type Segment = { label: string; value: number; color: string };

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function Donut({ segments }: { segments: Segment[] }) {
  const [active, setActive] = useState(-1);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(t);
  }, []);

  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 54;
  const C = 2 * Math.PI * r;
  let offset = 0;

  const someActive = active >= 0;
  const activeSeg = someActive ? segments[active] : null;
  const centerTop = activeSeg ? activeSeg.label : "Total";
  const centerVal = activeSeg ? fmt(activeSeg.value) : fmt(total);
  const centerPct = activeSeg ? Math.round((activeSeg.value / total) * 100) + "%" : "";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: 150, height: 150, flex: "none" }}>
        <svg
          width="150"
          height="150"
          style={{
            transform: "rotate(-90deg) scale(" + (mounted ? 1 : 0.86) + ")",
            opacity: mounted ? 1 : 0,
            transition: "opacity .5s ease, transform .5s cubic-bezier(.2,.8,.2,1)",
          }}
        >
          <circle cx="75" cy="75" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="16" />
          {segments.map((s, i) => {
            const len = (s.value / total) * C;
            const isThis = active === i;
            const el = (
              <circle
                key={i}
                cx="75"
                cy="75"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={isThis ? 20 : 16}
                strokeDasharray={len + " " + (C - len)}
                strokeDashoffset={-offset}
                opacity={someActive ? (isThis ? 1 : 0.3) : 1}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(-1)}
                style={{ transition: "stroke-width .18s ease, opacity .18s ease", cursor: "pointer" }}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            pointerEvents: "none",
            opacity: mounted ? 1 : 0,
            transition: "opacity .5s ease .1s",
          }}
        >
          <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600, maxWidth: 116, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{centerTop}</span>
          <span className="num" style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>{centerVal}</span>
          {centerPct ? <span className="num" style={{ fontSize: 11, color: "var(--muted)" }}>{centerPct}</span> : null}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 140 }}>
        {segments.map((s, i) => {
          const isThis = active === i;
          return (
            <div
              key={i}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(-1)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                cursor: "pointer",
                padding: "3px 6px",
                margin: "0 -6px",
                borderRadius: 8,
                background: isThis ? "var(--surface2)" : "transparent",
                transition: "background .14s ease",
              }}
            >
              <span className="dot" style={{ background: s.color }} />
              <span style={{ flex: 1 }}>{s.label}</span>
              <span className="muted num">{Math.round((s.value / total) * 100)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
