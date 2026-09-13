import { PDFDocument, StandardFonts, rgb, PDFFont } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleLabel } from "@/lib/roles";

// Merged PDF builder for the Documents to Sign module. Modelled on
// web/lib/signedPdf.ts: pull the original from the PRIVATE sign-documents bucket
// with the service-role client, append it when it is really a PDF, then add ONE
// signatures certificate page. The certificate carries a PandaDoc-style audit
// block for BOTH parties (member + Admin/Chairlady countersignature): full name,
// role, email, the exact signing timestamp (EAT), the signature image and the
// method used, plus a document reference.

const BUCKET = "sign-documents";

// Keep text WinAnsi-safe so the standard Helvetica font never fails to encode.
function san(v: any): string {
  return String(v ?? "").replace(/[^\x20-\x7E]/g, "").trim();
}
function fmtDate(v?: string | null): string {
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
function fmtDateTime(v?: string | null): string {
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
function parseDataUrl(s?: string | null): { kind: "png" | "jpg"; bytes: Uint8Array } | null {
  if (!s || typeof s !== "string") return null;
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(s);
  if (!m) return null;
  const kind = m[1].toLowerCase().startsWith("jp") ? "jpg" : "png";
  return { kind, bytes: Uint8Array.from(Buffer.from(m[2], "base64")) };
}
function slug(s: string): string {
  return san(s).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "document";
}
function docTypeReadable(v?: string | null): string {
  const map: Record<string, string> = {
    enrollment: "Enrollment",
    claim: "Claim",
    exit: "Exit",
    welfare_statement: "Welfare statement",
    kyc: "KYC",
    other: "Other",
  };
  return map[String(v || "")] || "Other";
}

export type SignedRequestPdf = { bytes: Uint8Array; filename: string; originalIncluded: boolean };

export async function buildSignedRequestPdf(
  recipientId: string
): Promise<SignedRequestPdf | null> {
  const admin = createAdminClient();

  const { data: rcpt } = await admin
    .from("sign_request_recipients")
    .select("*")
    .eq("id", recipientId)
    .single();
  if (!rcpt) return null;

  const { data: req } = await admin
    .from("sign_requests")
    .select("*")
    .eq("id", rcpt.request_id)
    .single();
  if (!req) return null;

  const { data: member } = await admin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", rcpt.member_id)
    .maybeSingle();

  let countersigner: any = null;
  if (rcpt.countersigned_by) {
    const { data: cs } = await admin
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", rcpt.countersigned_by)
      .maybeSingle();
    countersigner = cs;
  }

  // Download the original from the private bucket with the service-role client.
  let out: PDFDocument | null = null;
  let originalIncluded = false;
  if (req.file_path) {
    try {
      const { data: file } = await admin.storage.from(BUCKET).download(req.file_path);
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") {
          out = await PDFDocument.load(bytes, { ignoreEncryption: true });
          originalIncluded = true;
        }
      }
    } catch {
      out = null;
      originalIncluded = false;
    }
  }
  if (!out) out = await PDFDocument.create();
  // A non-null PDFDocument alias so embedPng/embedJpg type-check inside the
  // nested async signature helper below.
  const doc = out;

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const M = 56;
  const contentW = width - 2 * M;
  const ink = rgb(0.1, 0.06, 0.1);
  const muted = rgb(0.42, 0.38, 0.45);
  const purple = rgb(0.49, 0.15, 0.45);
  const green = rgb(0.16, 0.55, 0.28);
  const line = rgb(0.85, 0.82, 0.86);
  const cardBg = rgb(0.985, 0.975, 0.99);
  let y = height - 54;

  const at = (t: string, x: number, yy: number, size: number, f: PDFFont, color = ink) =>
    page.drawText(san(t) || " ", { x, y: yy, size, font: f, color });
  const right = (t: string, xRight: number, yy: number, size: number, f: PDFFont, color = ink) => {
    const s = san(t) || " ";
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: xRight - w, y: yy, size, font: f, color });
  };

  // ---- Header ----
  at("AWIVEST", M, y, 22, bold, purple);
  y -= 18;
  at("Signature certificate", M, y, 11, font, muted);
  right("Ref " + String(rcpt.id).slice(0, 8).toUpperCase(), width - M, y, 10, bold, muted);
  y -= 16;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 1, color: line });
  y -= 26;

  // ---- Document ----
  at("DOCUMENT", M, y, 8.5, bold, muted);
  y -= 17;
  at(req.title || "Document", M, y, 15, bold);
  y -= 18;
  at("Type: " + docTypeReadable(req.doc_type) + "     Sent: " + fmtDate(req.created_at), M, y, 10, font, muted);
  y -= 24;

  const statusText =
    rcpt.status === "completed"
      ? "Completed - fully signed"
      : rcpt.member_signed_at
      ? "Signed - awaiting countersignature"
      : "Awaiting member signature";
  at("STATUS", M, y, 8.5, bold, muted);
  at(statusText, M + 62, y, 10.5, bold, rcpt.status === "completed" ? green : ink);
  y -= 26;

  // ---- Signer card helper (PandaDoc-style audit block) ----
  const signerCard = async (
    label: string,
    opts: {
      name: string;
      role: string;
      email: string;
      whenISO?: string | null;
      method?: string | null;
      img64?: string | null;
      pending?: boolean;
    }
  ) => {
    const H = opts.pending ? 64 : 112;
    const top = y;
    const bottom = top - H;
    page.drawRectangle({ x: M, y: bottom, width: contentW, height: H, color: cardBg, borderColor: line, borderWidth: 1 });
    const p = 14;
    at(label, M + p, top - 18, 8.5, bold, purple);

    if (opts.pending) {
      at("Awaiting signature", M + p, top - 42, 12, italic, muted);
      y = bottom - 16;
      return;
    }

    // Signature box (left).
    const sigX = M + p;
    const sigW = 200;
    const sigH = 62;
    const sigY = bottom + 14;
    page.drawRectangle({ x: sigX, y: sigY, width: sigW, height: sigH, color: rgb(1, 1, 1), borderColor: line, borderWidth: 0.8 });
    const sig = parseDataUrl(opts.img64);
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
      at(opts.name || "-", sigX + 10, sigY + sigH / 2 - 6, 16, italic, ink);
    }

    // Details column (right).
    const dx = sigX + sigW + 22;
    let dy = top - 40;
    at(opts.name || "-", dx, dy, 12.5, bold, ink);
    dy -= 16;
    if (opts.role) {
      at(opts.role, dx, dy, 9.5, font, muted);
      dy -= 14;
    }
    if (opts.email) {
      at(opts.email, dx, dy, 9.5, font, ink);
      dy -= 14;
    }
    at("Signed: " + fmtDateTime(opts.whenISO), dx, dy, 9.5, font, ink);
    dy -= 13;
    at("Method: " + (opts.method === "upload" ? "Uploaded image" : "Drawn signature"), dx, dy, 9, font, muted);

    y = bottom - 16;
  };

  const memberRole = member ? roleLabel(member.role) : "";
  await signerCard("MEMBER SIGNATURE", {
    name: rcpt.member_signed_name || member?.full_name || "Member",
    role: memberRole,
    email: member?.email || "",
    whenISO: rcpt.member_signed_at,
    method: rcpt.member_signature_kind,
    img64: rcpt.member_signature_image,
    pending: !rcpt.member_signed_at,
  });

  const hasCountersign = !!(rcpt.countersigned_at || rcpt.countersign_signature_image || rcpt.countersigned_name);
  const csRole = countersigner ? roleLabel(countersigner.role) : "";
  const csLabel = "COUNTERSIGNATURE" + (csRole ? " - " + csRole.toUpperCase() : " - OFFICE");
  await signerCard(csLabel, {
    name: rcpt.countersigned_name || countersigner?.full_name || "Administrator",
    role: csRole,
    email: countersigner?.email || "",
    whenISO: rcpt.countersigned_at,
    method: rcpt.countersign_signature_kind,
    img64: rcpt.countersign_signature_image,
    pending: !hasCountersign,
  });

  // ---- Footer audit note ----
  y -= 4;
  at("This certificate records the electronic signatures applied to the document above within the AWIVEST Investor Portal.", M, y, 8.5, font, muted);
  y -= 12;
  at("Reference " + String(rcpt.id).slice(0, 8).toUpperCase() + "     Generated " + fmtDateTime(new Date().toISOString()), M, y, 8.5, font, muted);
  if (!originalIncluded) {
    y -= 12;
    at("Note: the original document could not be embedded (not a PDF). This certificate stands as the signed record.", M, y, 8.5, font, muted);
  }

  const bytes = await doc.save();
  const filename = slug(member?.full_name || "member") + "-" + slug(req.title || "document") + "-signed.pdf";
  return { bytes, filename, originalIncluded };
}
