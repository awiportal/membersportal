"use client";

import { useRef, useEffect, useState, useCallback } from "react";

type Props = { name?: string; height?: number };

// A lightweight in-app signature pad: the member draws with a mouse or finger,
// and the PNG data URL is written into a hidden <input> so it submits with the
// surrounding form. No external e-sign service required.
export default function SignaturePad({ name = "signature_image", height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenRef = useRef<HTMLInputElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const inked = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1220";
  }, []);

  useEffect(() => {
    setup();
  }, [setup]);

  function point(e: React.PointerEvent) {
    const canvas = canvasRef.current;
    if (canvas === null) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLCanvasElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    drawing.current = true;
    last.current = point(e);
  }

  function moveTo(e: React.PointerEvent) {
    if (drawing.current === false) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    const from = last.current;
    if (ctx === null || from === null) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (inked.current === false) {
      inked.current = true;
      setHasInk(true);
    }
  }

  function commit() {
    const hidden = hiddenRef.current;
    const canvas = canvasRef.current;
    if (hidden === null || canvas === null) return;
    hidden.value = inked.current ? canvas.toDataURL("image/png") : "";
  }

  function up() {
    if (drawing.current === false) return;
    drawing.current = false;
    last.current = null;
    commit();
  }

  function clear() {
    const canvas = canvasRef.current;
    if (canvas !== null) {
      const ctx = canvas.getContext("2d");
      if (ctx !== null) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    inked.current = false;
    setHasInk(false);
    const hidden = hiddenRef.current;
    if (hidden !== null) hidden.value = "";
  }

  return (
    <div>
      <div style={{ position: "relative", border: "1px solid var(--border)", borderRadius: 12, background: "#ffffff", touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height, display: "block", borderRadius: 12, cursor: "crosshair" }}
          onPointerDown={down}
          onPointerMove={moveTo}
          onPointerUp={up}
          onPointerLeave={up}
        />
        {hasInk === false && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", color: "#94a3b8", fontSize: 13 }}>
            Draw your signature here
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span className="muted" style={{ fontSize: 11.5 }}>Use your mouse or finger to sign.</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>
          <i className="fa-solid fa-eraser" /> Clear
        </button>
      </div>
      <input ref={hiddenRef} type="hidden" name={name} defaultValue="" />
    </div>
  );
}
