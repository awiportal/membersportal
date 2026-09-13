import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

// Shared certificate primitives for every signed-PDF builder in the app
// (agreements/onboarding via lib/signedPdf.ts and Documents to Sign via
// lib/signedRequestPdf.ts). Keeping the header, the signer "audit card" and the
// date/timestamp formatting here means the two certificates render identically
// and cannot drift apart. Timestamps are shown in East Africa Time.

export const CERT_MARGIN = 56;

export const CERT_COLORS = {
  ink: rgb(0.1, 0.06, 0.1),
  muted: rgb(0.42, 0.38, 0.45),
  purple: rgb(0.49, 0.15, 0.45),
  green: rgb(0.16, 0.55, 0.28),
  line: rgb(0.85, 0.82, 0.86),
  cardBg: rgb(0.985, 0.975, 0.99),
  white: rgb(1, 1, 1),
};

// Keep text WinAnsi-safe so the standard Helvetica font never fails to encode.
export function sanitizePdfText(v: any): string {
  return String(v ?? "").replace(/[^\x20-\x7E]/g, "").trim();
}

export function fmtCertDate(v?: string | null): string {
  if (!v) return "-";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return String(v);
  return dt.toLocaleDateString("en-GB", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Exact audit timestamp: date + 24h time, rendered in East Africa Time.
export function fmtCertDateTime(v?: string | null): string {
  if (!v) return "-";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return String(v);
  const s = dt.toLocaleString("en-GB", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return s + " EAT";
}

export function parseSignatureDataUrl(
  s?: string | null
): { kind: "png" | "jpg"; bytes: Uint8Array } | null {
  if (!s || typeof s !== "string") return null;
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(s);
  if (!m) return null;
  const kind = m[1].toLowerCase().startsWith("jp") ? "jpg" : "png";
  return { kind, bytes: Uint8Array.from(Buffer.from(m[2], "base64")) };
}

export function pdfSlug(s: string): string {
  return sanitizePdfText(s).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "document";
}

// Signature method as a human label. Anything that is not an explicit upload is
// treated as a drawn signature (the default capture mode).
export function signatureMethodLabel(kind?: string | null): string {
  return kind === "upload" ? "Uploaded image" : "Drawn signature";
}

export type CertFonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };

export async function embedCertFonts(doc: PDFDocument): Promise<CertFonts> {
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
}

// Draw the shared header: AWIVEST wordmark, a subtitle, a right-aligned
// reference, and a divider rule. Returns the y just below the rule.
export function drawCertHeader(
  page: PDFPage,
  fonts: CertFonts,
  width: number,
  subtitle: string,
  refShort: string
): number {
  const M = CERT_MARGIN;
  const { ink, muted, purple, line } = CERT_COLORS;
  const { height } = page.getSize();
  let y = height - 54;
  page.drawText("AWIVEST", { x: M, y, size: 22, font: fonts.bold, color: purple });
  y -= 18;
  page.drawText(sanitizePdfText(subtitle) || " ", { x: M, y, size: 11, font: fonts.regular, color: muted });
  const rt = sanitizePdfText("Ref " + refShort);
  const rw = fonts.bold.widthOfTextAtSize(rt, 10);
  page.drawText(rt, { x: width - M - rw, y, size: 10, font: fonts.bold, color: muted });
  y -= 16;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 1, color: line });
  y -= 26;
  return y;
}

// Draw one PandaDoc-style signer "audit card" starting at yTop. The card shows
// the signature image (or the typed name) on the left and the signer's audit
// detail lines on the right (name in bold, then up to four detail lines such as
// role, email, exact timestamp and method). Returns the y just below the card.
export async function drawSignerCard(
  doc: PDFDocument,
  page: PDFPage,
  fonts: CertFonts,
  width: number,
  yTop: number,
  label: string,
  opts: { name: string; lines: string[]; img64?: string | null; pending?: boolean }
): Promise<number> {
  const M = CERT_MARGIN;
  const { ink, muted, purple, line, cardBg, white } = CERT_COLORS;
  const contentW = width - 2 * M;
  const lines = (opts.lines || []).filter((l) => !!l && l.trim().length > 0).slice(0, 4);
  const H = opts.pending ? 64 : 112;
  const top = yTop;
  const bottom = top - H;

  page.drawRectangle({ x: M, y: bottom, width: contentW, height: H, color: cardBg, borderColor: line, borderWidth: 1 });
  const p = 14;
  page.drawText(sanitizePdfText(label) || " ", { x: M + p, y: top - 18, size: 8.5, font: fonts.bold, color: purple });

  if (opts.pending) {
    page.drawText("Awaiting signature", { x: M + p, y: top - 42, size: 12, font: fonts.italic, color: muted });
    return bottom - 16;
  }

  // Signature box (left).
  const sigX = M + p;
  const sigW = 200;
  const sigH = 62;
  const sigY = bottom + 14;
  page.drawRectangle({ x: sigX, y: sigY, width: sigW, height: sigH, color: white, borderColor: line, borderWidth: 0.8 });
  const sig = parseSignatureDataUrl(opts.img64);
  let drew = false;
  if (sig) {
    try {
      const img = sig.kind === "jpg" ? await doc.embedJpg(sig.bytes) : await doc.embedPng(sig.bytes);
      const scale = Math.min((sigW - 16) / img.width, (sigH - 12) / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: sigX + (sigW - w) / 2, y: sigY + (sigH - h) / 2, width: w, height: h });
      drew = true;
    } catch {
      drew = false;
    }
  }
  if (!drew) {
    page.drawText(sanitizePdfText(opts.name) || "-", { x: sigX + 10, y: sigY + sigH / 2 - 6, size: 16, font: fonts.italic, color: ink });
  }

  // Detail column (right).
  const dx = sigX + sigW + 22;
  let dy = top - 40;
  page.drawText(sanitizePdfText(opts.name) || "-", { x: dx, y: dy, size: 12.5, font: fonts.bold, color: ink });
  dy -= 16;
  for (const ln of lines) {
    page.drawText(sanitizePdfText(ln) || " ", { x: dx, y: dy, size: 9.5, font: fonts.regular, color: ink });
    dy -= 13;
  }

  return bottom - 16;
}
