import { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleLabel } from "@/lib/roles";
import { parseCustomFields } from "@/lib/customFields";
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

// Merged PDF builder for a SEQUENTIAL (ordered) sign request. Mirrors
// lib/signedRequestPdf.ts but renders one signer "audit card" per ordered step.
// Pulls the original from the PRIVATE sign-documents bucket with the service-role
// client, appends it when it is really a PDF, then adds a signatures certificate
// carrying every step in order. New pages are added as needed so long chains do
// not overflow one page.

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

export type SignedSequencePdf = {
  bytes: Uint8Array;
  filename: string;
  originalIncluded: boolean;
};

export async function buildSignedSequencePdf(
  requestId: string
): Promise<SignedSequencePdf | null> {
  const admin = createAdminClient();

  const { data: req } = await admin
    .from("sign_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (!req) return null;

  const { data: stepRows } = await admin
    .from("sign_request_steps")
    .select("*")
    .eq("request_id", requestId)
    .order("step_order", { ascending: true });
  const steps = (stepRows ?? []) as any[];

  const signerIds = Array.from(new Set(steps.map((s) => s.signer_id).filter(Boolean)));
  const { data: profRows } = signerIds.length
    ? await admin.from("profiles").select("id, full_name, email, role").in("id", signerIds)
    : { data: [] as any[] };
  const profById: Record<string, any> = {};
  ((profRows ?? []) as any[]).forEach((p) => (profById[p.id] = p));

  // Download the original from the private bucket with the service-role client.
  let out: PDFDocument | null = null;
  let originalIncluded = false;
  if ((req as any).file_path) {
    try {
      const { data: file } = await admin.storage.from(BUCKET).download((req as any).file_path);
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

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const fonts = await embedCertFonts(doc);
  let page = doc.addPage([PAGE_W, PAGE_H]);
  const width = page.getSize().width;
  const M = CERT_MARGIN;
  const { ink, muted, green } = CERT_COLORS;
  const refShort = String((req as any).id).slice(0, 8).toUpperCase();

  const drawOn = (
    pg: PDFPage,
    t: string,
    x: number,
    yy: number,
    size: number,
    f: PDFFont,
    color: any = ink
  ) => pg.drawText(sanitizePdfText(t) || " ", { x, y: yy, size, font: f, color });

  let y = drawCertHeader(page, fonts, width, "Signature certificate", refShort);

  // ---- Document ----
  drawOn(page, "DOCUMENT", M, y, 8.5, fonts.bold, muted);
  y -= 17;
  drawOn(page, (req as any).title || "Document", M, y, 15, fonts.bold);
  y -= 18;
  drawOn(
    page,
    "Type: " + docTypeReadable((req as any).doc_type) + "     Created: " + fmtCertDate((req as any).created_at),
    M,
    y,
    10,
    fonts.regular,
    muted
  );
  y -= 20;

  const total = steps.length;
  const signedCount = steps.filter((s) => s.status === "signed").length;
  const completed = !!(req as any).completed_at;
  const statusText = completed
    ? "Completed - fully signed in order"
    : `In progress - ${signedCount} of ${total} signed`;
  drawOn(page, "STATUS", M, y, 8.5, fonts.bold, muted);
  drawOn(page, statusText, M + 62, y, 10.5, fonts.bold, completed ? green : ink);
  y -= 26;

  // ---- One audit card per ordered step ----
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const prof = profById[step.signer_id] || {};
    const roleName = String(step.signer_role || roleLabel(prof.role) || "");
    const label = `STEP ${i + 1} - ${roleName.toUpperCase()}`;
    const lines = [
      roleLabel(prof.role),
      prof.email || "",
      "Signed: " + fmtCertDateTime(step.signed_at),
      "Method: " + signatureMethodLabel(step.signature_kind),
    ];
    const pending = step.status !== "signed";

    // Vertical overflow guard: a full signed card is ~112pt tall plus its label;
    // start a new page when we are getting close to the bottom margin so the
    // card never runs off the page.
    if (y < 150) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = page.getSize().height - 72;
    }

    y = await drawSignerCard(doc, page, fonts, width, y, label, {
      name: step.signed_name || prof.full_name || "Signer",
      lines,
      img64: step.signature_image,
      pending,
    });
  }

  // ---- Footer audit note ----
  if (y < 90) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = page.getSize().height - 72;
  }
  y -= 4;
  drawOn(
    page,
    "This certificate records the electronic signatures applied in order to the document above within the AWIVEST Investor Portal.",
    M,
    y,
    8.5,
    fonts.regular,
    muted
  );
  y -= 12;
  drawOn(
    page,
    "Reference " + refShort + "     Generated " + fmtCertDateTime(new Date().toISOString()),
    M,
    y,
    8.5,
    fonts.regular,
    muted
  );
  if (!originalIncluded) {
    y -= 12;
    drawOn(
      page,
      "Note: the original document could not be embedded (not a PDF). This certificate stands as the signed record.",
      M,
      y,
      8.5,
      fonts.regular,
      muted
    );
  }

  const bytes = await doc.save();
  const filename = pdfSlug((req as any).title || "document") + "-signed.pdf";
  return { bytes, filename, originalIncluded };
}
