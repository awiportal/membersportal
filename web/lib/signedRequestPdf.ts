import { PDFDocument, PDFFont } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleLabel } from "@/lib/roles";
import {
  CERT_COLORS,
  CERT_MARGIN,
  drawCertHeader,
  drawSignerCard,
  embedCertFonts,
  fmtCertDate,
  fmtCertDateTime,
  pdfSlug,
  sanitizePdfText,
  signatureMethodLabel,
} from "@/lib/pdfSignature";

// Merged PDF builder for the Documents to Sign module. Pulls the original from
// the PRIVATE sign-documents bucket with the service-role client, appends it when
// it is really a PDF, then adds ONE signatures certificate page. The certificate
// uses the shared PandaDoc-style audit block (lib/pdfSignature) carrying BOTH the
// member signature and the Admin/Chairlady countersignature.

const BUCKET = "sign-documents";

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
  const doc = out;

  const fonts = await embedCertFonts(doc);
  const page = doc.addPage([595.28, 841.89]);
  const { width } = page.getSize();
  const M = CERT_MARGIN;
  const { ink, muted, green } = CERT_COLORS;
  const refShort = String(rcpt.id).slice(0, 8).toUpperCase();

  const draw = (t: string, x: number, yy: number, size: number, f: PDFFont, color: any = ink) =>
    page.drawText(sanitizePdfText(t) || " ", { x, y: yy, size, font: f, color });

  let y = drawCertHeader(page, fonts, width, "Signature certificate", refShort);

  // ---- Document ----
  draw("DOCUMENT", M, y, 8.5, fonts.bold, muted);
  y -= 17;
  draw(req.title || "Document", M, y, 15, fonts.bold);
  y -= 18;
  draw("Type: " + docTypeReadable(req.doc_type) + "     Sent: " + fmtCertDate(req.created_at), M, y, 10, fonts.regular, muted);
  y -= 24;

  const statusText =
    rcpt.status === "completed"
      ? "Completed - fully signed"
      : rcpt.member_signed_at
      ? "Signed - awaiting countersignature"
      : "Awaiting member signature";
  draw("STATUS", M, y, 8.5, fonts.bold, muted);
  draw(statusText, M + 62, y, 10.5, fonts.bold, rcpt.status === "completed" ? green : ink);
  y -= 26;

  // ---- Member signature card ----
  const memberLines = [
    roleLabel(member?.role),
    member?.email || "",
    "Signed: " + fmtCertDateTime(rcpt.member_signed_at),
    "Method: " + signatureMethodLabel(rcpt.member_signature_kind),
  ];
  y = await drawSignerCard(doc, page, fonts, width, y, "MEMBER SIGNATURE", {
    name: rcpt.member_signed_name || member?.full_name || "Member",
    lines: memberLines,
    img64: rcpt.member_signature_image,
    pending: !rcpt.member_signed_at,
  });

  // ---- Countersignature card (Admin/Chairlady) ----
  const hasCountersign = !!(rcpt.countersigned_at || rcpt.countersign_signature_image || rcpt.countersigned_name);
  const csRole = countersigner ? roleLabel(countersigner.role) : "";
  const csLabel = "COUNTERSIGNATURE" + (csRole ? " - " + csRole.toUpperCase() : " - OFFICE");
  const csLines = [
    csRole,
    countersigner?.email || "",
    "Signed: " + fmtCertDateTime(rcpt.countersigned_at),
    "Method: " + signatureMethodLabel(rcpt.countersign_signature_kind),
  ];
  y = await drawSignerCard(doc, page, fonts, width, y, csLabel, {
    name: rcpt.countersigned_name || countersigner?.full_name || "Administrator",
    lines: csLines,
    img64: rcpt.countersign_signature_image,
    pending: !hasCountersign,
  });

  // ---- Footer audit note ----
  y -= 4;
  draw(
    "This certificate records the electronic signatures applied to the document above within the AWIVEST Investor Portal.",
    M,
    y,
    8.5,
    fonts.regular,
    muted
  );
  y -= 12;
  draw("Reference " + refShort + "     Generated " + fmtCertDateTime(new Date().toISOString()), M, y, 8.5, fonts.regular, muted);
  if (!originalIncluded) {
    y -= 12;
    draw(
      "Note: the original document could not be embedded (not a PDF). This certificate stands as the signed record.",
      M,
      y,
      8.5,
      fonts.regular,
      muted
    );
  }

  const bytes = await doc.save();
  const filename = pdfSlug(member?.full_name || "member") + "-" + pdfSlug(req.title || "document") + "-signed.pdf";
  return { bytes, filename, originalIncluded };
}
