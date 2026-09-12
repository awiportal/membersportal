"use client";

import { useRef, useEffect, useState, useCallback } from "react";

type Props = { name?: string; height?: number };
type Mode = "draw" | "upload";

// A lightweight in-app signature capture. The member can either draw their
// signature with a mouse/finger ("Sign online") or upload a photo/scan of a
// handwritten signature ("Upload"). In both cases the resulting image data URL
// is written into a hidden <input> so it submits with the surrounding form.
// No external e-sign service required.
export default function SignaturePad({ name = "signature_image", height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const inked = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [mode, setMode] = useState<Mode>("draw");
  const [uploaded, setUploaded] = useState<string>("");

  function setHidden(value: string) {
    const hidden = hiddenRef.current;
    if (hidden !== null) hidden.value = value;
  }

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
    if (mode === "draw") setup();
  }, [setup, mode]);

  // ---------------------------- draw mode ----------------------------
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

  function commitDraw() {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    setHidden(inked.current ? canvas.toDataURL("image/png") : "");
  }

  function up() {
    if (drawing.current === false) return;
    drawing.current = false;
    last.current = null;
    commitDraw();
  }

  function clearDraw() {
    const canvas = canvasRef.current;
    if (canvas !== null) {
      const ctx = canvas.getContext("2d");
      if (ctx !== null) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    inked.current = false;
    setHasInk(false);
    setHidden("");
  }

  // ---------------------------- upload mode ----------------------------
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.type.startsWith("image/") === false) {
      window.alert("Please choose an image file (a photo or scan of your signature).");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const maxW = 700;
      const scale = Math.min(1, maxW / (img.width || maxW));
      const w = Math.max(1, Math.round((img.width || maxW) * scale));
      const h = Math.max(1, Math.round((img.height || maxW) * scale));
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext("2d");
      if (ctx === null) { URL.revokeObjectURL(url); return; }
      // Flatten onto white so transparent PNGs / dark scans read cleanly.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      let data = cv.toDataURL("image/jpeg", 0.82);
      // The server accepts signature images under ~700 KB; step quality down if needed.
      if (data.length > 660000) data = cv.toDataURL("image/jpeg", 0.6);
      if (data.length > 660000) data = cv.toDataURL("image/jpeg", 0.4);
      setUploaded(data);
      setHidden(data);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      window.alert("We could not read that image. Please try a different photo or scan.");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function clearUpload() {
    setUploaded("");
    setHidden("");
    if (fileRef.current !== null) fileRef.current.value = "";
  }

  // Switching modes discards the other mode's capture so only the active
  // signature is submitted.
  function switchMode(next: Mode) {
    if (next === mode) return;
    if (mode === "draw") clearDraw(); else clearUpload();
    setHidden("");
    setMode(next);
  }

  const tabBase: React.CSSProperties = {
    flex: 1,
    padding: "7px 10px",
    borderRadius: 9,
    fontSize: 12.5,
    fontWeight: 600,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--muted)",
    cursor: "pointer",
  };
  const tabActive: React.CSSProperties = {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid var(--border)",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)", marginBottom: 10 }}>
        <button type="button" style={{ ...tabBase, ...(mode === "draw" ? tabActive : {}) }} onClick={() => switchMode("draw")}>
          <i className="fa-solid fa-pen-nib" style={{ marginRight: 6 }} /> Sign online
        </button>
        <button type="button" style={{ ...tabBase, ...(mode === "upload" ? tabActive : {}) }} onClick={() => switchMode("upload")}>
          <i className="fa-solid fa-upload" style={{ marginRight: 6 }} /> Upload
        </button>
      </div>

      {mode === "draw" ? (
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearDraw}>
              <i className="fa-solid fa-eraser" /> Clear
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ position: "relative", minHeight: height, border: "1px dashed var(--border)", borderRadius: 12, background: "#ffffff", display: "grid", placeItems: "center", padding: 12, overflow: "hidden" }}>
            {uploaded ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={uploaded} alt="Uploaded signature" style={{ maxHeight: height - 16, maxWidth: "100%", objectFit: "contain" }} />
            ) : (
              <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                <i className="fa-solid fa-image" style={{ fontSize: 20, display: "block", marginBottom: 6 }} />
                Upload a photo or scan of your signature
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 8, flexWrap: "wrap" }}>
            <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer", margin: 0 }}>
              <i className="fa-solid fa-upload" /> {uploaded ? "Choose another" : "Choose image"}
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
            </label>
            {uploaded && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearUpload}>
                <i className="fa-solid fa-xmark" /> Remove
              </button>
            )}
          </div>
        </div>
      )}

      <input ref={hiddenRef} type="hidden" name={name} defaultValue="" />
    </div>
  );
}
