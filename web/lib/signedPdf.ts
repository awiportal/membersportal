import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb, PDFFont } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "agreements";

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
  return san(s).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "agreement";
}

export type SignedPdf = { bytes: Uint8Array; filename: string; originalIncluded: boolean };

// Build "<original agreement> + <signature page>" for one acceptance and return
// the PDF bytes. Row access is governed by the passed supabase client's RLS:
// a member client only resolves the member's own acceptance; a staff client any.
// The original is pulled from the private agreements bucket (service role) and
// merged when it is really a PDF; otherwise just the signature page is returned.
export async function buildSignedAgreementPdf(
  supabase: SupabaseClient,
  acceptanceId: string
): Promise<SignedPdf | null> {
  const { data: acc } = await supabase
    .from("agreement_acceptances")
    .select("*")
    .eq("id", acceptanceId)
    .single();
  if (!acc) return null;

  const [{ data: agr }, { data: member }, { data: fin }] = await Promise.all([
    supabase.from("agreement_documents").select("*").eq("id", acc.agreement_id).single(),
    supabase.from("profiles").select("*").eq("id", acc.member_id).single(),
    supabase.from("member_finances").select("member_no").eq("member_id", acc.member_id).maybeSingle(),
  ]);

  let out: PDFDocument | null = null;
  let originalIncluded = false;
  if (agr?.file_path) {
    try {
      // Download the blank template with the service-role client so it works on
      // the private 'agreements' bucket regardless of the caller's RLS (#94).
      const admin = createAdminClient();
      const { data: file } = await admin.storage.from(BUCKET).download(agr.file_path);
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

  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const page = out.addPage([595.28, 841.89]);
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
  text("Certificate of acceptance", M, 11, font, muted);
  y -= 20;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 1, color: line });
  y -= 30;

  text("AGREEMENT", M, 8.5, bold, muted);
  y -= 18;
  text(agr?.title || "Membership agreement", M, 15, bold);
  y -= 20;
  if (agr?.description) {
    text(agr.description, M, 10, font, muted);
    y -= 18;
  }
  y -= 12;

  const rows: [string, string][] = [
    ["Member", member?.full_name || acc.signed_name || "Member"],
    ["Member no.", fin?.member_no || member?.member_no || "-"],
    ["Email", member?.email || "-"],
    ["Signed name", acc.signed_name || "-"],
    ["Date signed", fmtDate(acc.signed_date || acc.signed_at)],
    ["Recorded", acc.signed_at ? new Date(acc.signed_at).toLocaleString("en-GB") : "-"],
    ["Reference", String(acc.id).slice(0, 8).toUpperCase()],
  ];
  for (const [k, v] of rows) {
    text(k.toUpperCase(), M, 8, bold, muted);
    y -= 13;
    text(v, M, 12, font);
    y -= 22;
  }

  y -= 6;
  text("SIGNATURE", M, 8.5, bold, muted);
  y -= 12;
  const sig = parseDataUrl(acc.signature_image);
  let drew = false;
  if (sig) {
    try {
      const img = sig.kind === "jpg" ? await out.embedJpg(sig.bytes) : await out.embedPng(sig.bytes);
      const scale = Math.min(260 / img.width, 110 / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawRectangle({ x: M, y: y - h - 14, width: w + 20, height: h + 20, color: rgb(1, 1, 1), borderColor: line, borderWidth: 1 });
      page.drawImage(img, { x: M + 10, y: y - h - 4, width: w, height: h });
      y -= h + 26;
      drew = true;
    } catch {
      drew = false;
    }
  }
  if (!drew) {
    text(acc.signed_name || member?.full_name || "", M, 22, font);
    y -= 30;
  }

  const who = member?.full_name || acc.signed_name || "Member";
  text("Signed by " + who + " on " + fmtDate(acc.signed_date || acc.signed_at) + ".", M, 10, font, muted);
  y -= 26;
  text("This page certifies the member acceptance of the agreement above within the AWIVEST members portal.", M, 8.5, font, muted);
  if (!originalIncluded) {
    y -= 16;
    text("Note: the original document could not be embedded (not a PDF). This certificate stands as the signed record.", M, 8.5, font, muted);
  }

  const bytes = await out.save();
  const filename = slug(member?.full_name || "member") + "-" + slug(agr?.title || "agreement") + "-signed.pdf";
  return { bytes, filename, originalIncluded };
}
