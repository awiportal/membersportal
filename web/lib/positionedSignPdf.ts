import { rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { embedCertFonts, parseSignatureDataUrl, pdfSlug, sanitizePdfText } from "@/lib/pdfSignature";
import { appendSequenceCertificate, loadOriginalPdf } from "@/lib/signedSequencePdf";
import { parseFieldLayout, signerKeyForStep, type PlacedField } from "@/lib/fieldLayout";

// Completion builder for a sequential sign request that carries a VISUAL FIELD
// LAYOUT (PandaDoc-style placement). It loads the embedded original, stamps every
// filled field at its exact coordinates, then appends the SAME signatures
// certificate the plain sequential builder uses (via appendSequenceCertificate).
//
// Field coordinates are normalized 0..1 of the page with a TOP-LEFT origin;
// pdf-lib draws from the BOTTOM-LEFT, so y is converted per page. Typed
// text/date/name values are drawn as text sized to fit the box; signature boxes
// embed the matching signer's captured signature image. Boxes with no value (and
// signature boxes whose signer left no signature) are simply skipped, so an
// in-progress or partially filled layout never produces broken output.
//
// A request with an empty field_layout should be routed to buildSignedSequencePdf
// instead; this builder still degrades gracefully if called with none (it just
// appends the certificate).

export type PositionedSignedPdf = {
  bytes: Uint8Array;
  filename: string;
  originalIncluded: boolean;
};

type StepInfo = { signatureImage: string | null; signedName: string | null };

export async function buildPositionedSignedPdf(
  requestId: string
): Promise<PositionedSignedPdf | null> {
  const admin = createAdminClient();

  const { data: req } = await admin
    .from("sign_requests")
    .select("id, title, file_path, field_layout")
    .eq("id", requestId)
    .single();
  if (!req) return null;

  const layout: PlacedField[] = parseFieldLayout((req as any).field_layout);

  const { doc, originalIncluded } = await loadOriginalPdf((req as any).file_path);

  // Map each signer_key -> that step's captured signature + typed name, so a
  // 'signature' box embeds the right signer's image and a 'name' box left blank
  // can fall back to the signer's recorded name.
  const { data: stepRows } = await admin
    .from("sign_request_steps")
    .select("step_order, signer_role, signed_name, signature_image")
    .eq("request_id", requestId)
    .order("step_order", { ascending: true });
  const byKey: Record<string, StepInfo> = {};
  for (const s of (stepRows ?? []) as any[]) {
    const key = signerKeyForStep(s.step_order as number, s.signer_role as string | null);
    byKey[key] = {
      signatureImage: (s.signature_image as string | null) ?? null,
      signedName: (s.signed_name as string | null) ?? null,
    };
  }

  // Only stamp when there is a real embedded original with pages to draw on. If
  // the upload was not a PDF there is nothing to place fields onto; the
  // certificate below still records every signature.
  if (originalIncluded && layout.length > 0) {
    const fonts = await embedCertFonts(doc);
    const pages = doc.getPages();
    for (const f of layout) {
      if (f.page < 0 || f.page >= pages.length) continue;
      const page = pages[f.page];
      const { width: pw, height: ph } = page.getSize();

      const boxX = f.x * pw;
      const boxW = f.w * pw;
      const boxH = f.h * ph;
      // TOP-LEFT normalized origin -> pdf-lib BOTTOM-LEFT origin.
      const boxBottom = ph - (f.y + f.h) * ph;

      if (f.type === "signature") {
        const info = byKey[f.signer_key];
        const sig = parseSignatureDataUrl(info ? info.signatureImage : null);
        if (!sig) continue;
        try {
          const img =
            sig.kind === "jpg" ? await doc.embedJpg(sig.bytes) : await doc.embedPng(sig.bytes);
          const pad = Math.min(4, boxW * 0.06, boxH * 0.12);
          const availW = Math.max(1, boxW - pad * 2);
          const availH = Math.max(1, boxH - pad * 2);
          const scale = Math.min(availW / img.width, availH / img.height, 1);
          const w = img.width * scale;
          const h = img.height * scale;
          page.drawImage(img, {
            x: boxX + (boxW - w) / 2,
            y: boxBottom + (boxH - h) / 2,
            width: w,
            height: h,
          });
        } catch {
          /* skip a signature that fails to embed */
        }
        continue;
      }

      // Text-like box (text/date/name). Use the stored value; fall back to the
      // signer's recorded name for a 'name' box that was left unfilled.
      let text = typeof f.value === "string" ? f.value : "";
      if (!text && f.type === "name") {
        const info = byKey[f.signer_key];
        text = info && info.signedName ? info.signedName : "";
      }
      const clean = sanitizePdfText(text);
      if (!clean) continue;

      // Size the text to the box height, then shrink to fit the width.
      let size = Math.max(6, Math.min(18, boxH * 0.7));
      const maxW = Math.max(1, boxW - 4);
      let textW = fonts.regular.widthOfTextAtSize(clean, size);
      while (textW > maxW && size > 5) {
        size -= 0.5;
        textW = fonts.regular.widthOfTextAtSize(clean, size);
      }
      // Vertically centre the baseline within the box.
      const textY = boxBottom + (boxH - size) / 2 + size * 0.16;
      page.drawText(clean, {
        x: boxX + 2,
        y: textY,
        size,
        font: fonts.regular,
        color: rgb(0.06, 0.06, 0.1),
      });
    }
  }

  await appendSequenceCertificate(doc, requestId, originalIncluded);

  const bytes = await doc.save();
  const filename = pdfSlug((req as any).title || "document") + "-signed.pdf";
  return { bytes, filename, originalIncluded };
}
