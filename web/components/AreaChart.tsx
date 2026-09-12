"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

// Dependency-free SVG area chart with a draw-in animation and a hover readout
// (guide line, point marker, value tooltip). Client component. Prop signature is
// backward-compatible: existing callers pass only { data, height }. Optional
// labels / valuePrefix enrich the tooltip when a caller supplies them.
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function AreaChart({
  data,
  height = 240,
  labels,
  valuePrefix = "",
}: {
  data: number[];
  height?: number;
  labels?: string[];
  valuePrefix?: string;
}) {
  const W = 640;
  const H = 240;
  const pad = 8;
  const n = data.length;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = (W - pad * 2) / Math.max(n - 1, 1);

  const pts = data.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (H - pad * 2) * (1 - (v - min) / span);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => (i === 0 ? "M" : "L") + " " + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area =
    pts.length > 0
      ? line + " L " + pts[n - 1][0].toFixed(1) + " " + (H - pad) + " L " + pts[0][0].toFixed(1) + " " + (H - pad) + " Z"
      : "";

  const pathRef = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(0);
  const [drawn, setDrawn] = useState(false);
  const [hover, setHover] = useState(-1);

  useEffect(() => {
    const p = pathRef.current;
    setLen(p ? p.getTotalLength() : 0);
    const t = setTimeout(() => setDrawn(true), 60);
    return () => clearTimeout(t);
  }, [line]);

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / (rect.width || 1);
    let i = Math.round((mx * W - pad) / step);
    if (i < 0) i = 0;
    if (i > n - 1) i = n - 1;
    setHover(i);
  };

  const showTip = hover >= 0 && n > 0;
  const hLeftPct = showTip ? (pts[hover][0] / W) * 100 : 0;
  const hTopPct = showTip ? (pts[hover][1] / H) * 100 : 0;
  const hLabel = showTip ? (labels && labels[hover] ? labels[hover] : "Point " + (hover + 1)) : "";
  const tipFlip = hLeftPct > 62;

  return (
    <div
      style={{ position: "relative", width: "100%", height }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(-1)}
    >
      <svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a6cd35" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#a6cd35" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#areaFill)" style={{ opacity: drawn ? 1 : 0, transition: "opacity .7s ease .15s" }} />
        <path
          ref={pathRef}
          d={line}
          fill="none"
          stroke="#a6cd35"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={len > 0 ? len : undefined}
          strokeDashoffset={drawn ? 0 : len}
          style={{ opacity: drawn ? 1 : 0, transition: "stroke-dashoffset .9s cubic-bezier(.4,0,.2,1), opacity .3s ease" }}
        />
      </svg>

      {showTip ? (
        <>
          <div style={{ position: "absolute", left: hLeftPct + "%", top: 0, bottom: 0, width: 1, background: "var(--border2)", transform: "translateX(-0.5px)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: hLeftPct + "%", top: hTopPct + "%", width: 10, height: 10, borderRadius: "50%", background: "#a6cd35", border: "2px solid var(--surface2)", transform: "translate(-5px,-5px)", pointerEvents: "none", boxShadow: "0 0 0 1px rgba(0,0,0,0.15)" }} />
          <div
            style={{
              position: "absolute",
              left: hLeftPct + "%",
              top: hTopPct + "%",
              transform: "translate(" + (tipFlip ? "calc(-100% - 12px)" : "12px") + ", -50%)",
              background: "var(--menu-bg)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "6px 10px",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "var(--shadow)",
              zIndex: 2,
            }}
          >
            <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600 }}>{hLabel}</div>
            <div className="num" style={{ fontSize: 13.5, fontWeight: 700 }}>{valuePrefix}{fmt(data[hover])}</div>
          </div>
        </>
      ) : null}
    </div>
  );
}
