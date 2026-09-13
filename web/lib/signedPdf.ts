import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument, PDFFont } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleLabel } from "@/lib/roles";
import {
  CERT_COLORS,
  CERT_MARGIN,
  drawCertHeader,
  drawSignerCard,
  embedCertFonts,
  fmtCertDateTime,
  pdfSlug,
  sanitizePdfText,
  signatureMethodLabel,
} from "@/lib/pdfSignature";

const BUCKET = "agreements";

export type SignedPdf = { bytes: Uint8Array; filename: string; originalIncluded: boolean };

// Build "<original agreement> + <signature certificate>" for one acceptance and
// return the PDF bytes. Row access is governed by the passed supabase client's
// RLS: a member client only resolves the member's own acceptance; a staff client
// any. The original is pulled from the private agreements bucket (service role)
// and merged when it is really a PDF; otherwise just the certificate is returned.
// The certificate uses the shared PandaDoc-style audit block (lib/pdfSignature)
// so it matches the Documents to Sign certificate exactly.
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
  const doc = out;

  const fonts = await embedCertFonts(doc);
  const page = doc.addPage([595.28, 841.89]);
  const { width } = page.getSize();
  const M = CERT_MARGIN;
  const { ink, muted } = CERT_COLORS;
  const refShort = String(acc.id).slice(0, 8).toUpperCase();

  const draw = (t: string, x: number, yy: number, size: number, f: PDFFont, color: any = ink) =>
    page.drawText(sanitizePdfText(t) || " ", { x, y: yy, size, font: f, color });

  let y = drawCertHeader(page, fonts, width, "Certificate of acceptance", refShort);

  // ---- Agreement ----
  draw("AGREEMENT", M, y, 8.5, fonts.bold, muted);
  y -= 17;
  draw(agr?.title || "Membership agreement", M, y, 15, fonts.bold);
  y -= 18;
  if (agr?.description) {
    draw(String(agr.description).slice(0, 110), M, y, 10, fonts.regular, muted);
    y -= 16;
  }
  const memberNo = fin?.member_no || member?.member_no || "";
  const metaLine =
    "Member: " +
    (member?.full_name || acc.signed_name || "Member") +
    (memberNo ? "     Member no. " + memberNo : "");
  draw(metaLine, M, y, 10, fonts.regular, muted);
  y -= 24;

  // ---- Signer audit card (single party: the member acceptance) ----
  const lines = [
    roleLabel(member?.role),
    member?.email || "",
    "Signed: " + fmtCertDateTime(acc.signed_at || acc.signed_date),
    "Method: " + signatureMethodLabel(acc.signature_kind),
  ];
  y = await drawSignerCard(doc, page, fonts, width, y, "MEMBER SIGNATURE", {
    name: acc.signed_name || member?.full_name || "Member",
    lines,
    img64: acc.signature_image,
    pending: !acc.signed_at && !acc.signature_image && !acc.signed_name,
  });

  // ---- Countersignature card (Admin/Chairlady approval), when present ----
  const hasCountersign = !!(acc.countersigned_at || acc.countersign_signature_image || acc.countersigned_name);
  if (hasCountersign) {
    let csProfile: any = null;
    if (acc.countersigned_by) {
      try {
        const adminC = createAdminClient();
        const { data: cs } = await adminC
          .from("profiles")
          .select("full_name, role")
          .eq("id", acc.countersigned_by)
          .maybeSingle();
        csProfile = cs;
      } catch {
        csProfile = null;
      }
    }
    const csRole = csProfile ? roleLabel(csProfile.role) : "";
    const csLabel = "COUNTERSIGNATURE" + (csRole ? " - " + csRole.toUpperCase() : " - OFFICE");
    const csLines = [
      csRole,
      "Approved and countersigned",
      "Signed: " + fmtCertDateTime(acc.countersigned_at),
      "Method: " + signatureMethodLabel(acc.countersign_signature_kind),
    ];
    y = await drawSignerCard(doc, page, fonts, width, y, csLabel, {
      name: acc.countersigned_name || csProfile?.full_name || "Administrator",
      lines: csLines,
      img64: acc.countersign_signature_image,
      pending: false,
    });
  }

  // ---- Footer ----
  y -= 4;
  draw(
    "This certificate records the member acceptance of the agreement above within the AWIVEST Investor Portal.",
    M,
    y,
    8.5,
    fonts.regular,
    muted
  );
  y -= 12;
  draw("Reference " + refShort + "     Recorded " + fmtCertDateTime(acc.signed_at), M, y, 8.5, fonts.regular, muted);
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
  const filename = pdfSlug(member?.full_name || "member") + "-" + pdfSlug(agr?.title || "agreement") + "-signed.pdf";
  return { bytes, filename, originalIncluded };
}
