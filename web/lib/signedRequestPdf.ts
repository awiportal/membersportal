import { PDFDocument, StandardFonts, rgb, PDFFont } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";

// Merged PDF builder for the Documents to Sign module. Modelled on
// web/lib/signedPdf.ts: pull the original from the PRIVATE sign-documents bucket
// with the service-role client, append it when it is really a PDF, then add ONE
// signatures page carrying BOTH the member signature and the Admin/Chairlady
// countersignature at the bottom.

const BUCKET = "sign-documents";

// Keep text WinAnsi-safe so the standard Helvetica font never fails to encode.
function san(v: any): string {
  return String(v ?? "").replace(/[^\x20-\x7E]/g, "").trim();
}
function fmtDate(v?: string | null): string {
  if (!v) return "-";
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return String(v);
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
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
    .select("id, full_name, email")
    .eq("id", rcpt.member_id)
    .maybeSingle();

  let countersigner: any = null;
  if (rcpt.countersigned_by) {
    const { data: cs } = await admin
      .from("profiles")
      .select("id, full_name, email")
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
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const M = 56;
  const ink = rgb(0.1, 0.06, 0.1);
  const muted = rgb(0.42, 0.38, 0.45);
  const purple = rgb(0.49, 0.15, 0.45);
  const line = rgb(0.85, 0.82, 0.86);
  let y = height - 54;
  const text = (t: string, x: number, size: number, f: PDFFont, color = ink) =>
    page.drawText(san(t) || " ", { x, y, size, font: f, color });

  text("AWIVEST", M, 22, bold, purple);
  y -= 20;
  text("Signature certificate", M, 11, font, muted);
  y -= 20;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 1, color: line });
  y -= 30;

  text("DOCUMENT", M, 8.5, bold, muted);
  y -= 18;
  text(req.title || "Document", M, 15, bold);
  y -= 22;

  const rows: [string, string][] = [
    ["Type", String(req.doc_type || "other")],
    ["Member", member?.full_name || rcpt.member_signed_name || "Member"],
    ["Email", member?.email || "-"],
    ["Reference", String(rcpt.id).slice(0, 8).toUpperCase()],
  ];
  for (const [k, v] of rows) {
    text(k.toUpperCase(), M, 8, bold, muted);
    y -= 13;
    text(v, M, 12, font);
    y -= 22;
  }

  // Draw a signature block: the drawn/uploaded image when present, else the
  // typed name. Uses `doc` (non-null) so embed* type-check.
  const drawSignature = async (img64: string | null | undefined, typedName: string) => {
    const sig = parseDataUrl(img64);
    if (sig) {
      try {
        const img = sig.kind === "jpg" ? await doc.embedJpg(sig.bytes) : await doc.embedPng(sig.bytes);
        const scale = Math.min(240 / img.width, 90 / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawRectangle({ x: M, y: y - h - 14, width: w + 20, height: h + 20, color: rgb(1, 1, 1), borderColor: line, borderWidth: 1 });
        page.drawImage(img, { x: M + 10, y: y - h - 4, width: w, height: h });
        y -= h + 26;
        return;
      } catch {
        /* fall through to the typed name */
      }
    }
    text(typedName || "", M, 22, font);
    y -= 30;
  };

  y -= 6;
  text("MEMBER SIGNATURE", M, 8.5, bold, muted);
  y -= 14;
  await drawSignature(rcpt.member_signature_image, rcpt.member_signed_name || member?.full_name || "");
  const memberWho = rcpt.member_signed_name || member?.full_name || "Member";
  text("Signed by " + memberWho + " on " + fmtDate(rcpt.member_signed_at) + ".", M, 10, font, muted);
  y -= 30;

  text("COUNTERSIGNED (Admin/Chairlady)", M, 8.5, bold, muted);
  y -= 14;
  const hasCountersign = !!(rcpt.countersigned_at || rcpt.countersign_signature_image || rcpt.countersigned_name);
  if (hasCountersign) {
    await drawSignature(rcpt.countersign_signature_image, rcpt.countersigned_name || countersigner?.full_name || "");
    const csWho = rcpt.countersigned_name || countersigner?.full_name || "Administrator";
    text("Countersigned by " + csWho + " on " + fmtDate(rcpt.countersigned_at) + ".", M, 10, font, muted);
    y -= 26;
  } else {
    text("Awaiting countersignature.", M, 12, font, muted);
    y -= 26;
  }

  if (!originalIncluded) {
    y -= 6;
    text("Note: the original document could not be embedded (not a PDF). This certificate stands as the signed record.", M, 8.5, font, muted);
  }

  const bytes = await doc.save();
  const filename = slug(member?.full_name || "member") + "-" + slug(req.title || "document") + "-signed.pdf";
  return { bytes, filename, originalIncluded };
}
