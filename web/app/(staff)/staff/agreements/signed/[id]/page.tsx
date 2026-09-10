import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

function fmtDate(v?: string | null) {
  if (v === undefined || v === null || v === "") return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function Cell({ k, v }: { k: string; v: any }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11.5 }}>{k}</div>
      <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2, wordBreak: "break-word" }}>{v || "-"}</div>
    </div>
  );
}

// Staff-only (the (staff) layout redirects non-staff). Renders a printable
// certificate of a member's agreement acceptance: the agreement, the member,
// and their drawn/typed signature. Download = browser print-to-PDF.
export default async function SignedAgreementCertificate({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: acc } = await supabase
    .from("agreement_acceptances")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!acc) notFound();

  const [{ data: agr }, { data: member }, { data: fin }] = await Promise.all([
    supabase.from("agreement_documents").select("*").eq("id", acc.agreement_id).single(),
    supabase.from("profiles").select("*").eq("id", acc.member_id).single(),
    supabase.from("member_finances").select("member_no").eq("member_id", acc.member_id).maybeSingle(),
  ]);

  const docUrl = agr?.file_path
    ? supabase.storage.from("agreements").getPublicUrl(agr.file_path).data.publicUrl
    : null;
  const signedOn = acc.signed_date || acc.signed_at;
  const memberName = member?.full_name || acc.signed_name || "Member";
  const memberNo = fin?.member_no || member?.member_no || null;
  const hasDrawn =
    typeof acc.signature_image === "string" && acc.signature_image.startsWith("data:image");

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div
        className="no-print"
        style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}
      >
        <Link href="/staff/agreements/signed" className="btn btn-ghost btn-sm">
          <i className="fa-solid fa-arrow-left" /> All signed agreements
        </Link>
        <div style={{ flex: 1 }} />
        {docUrl ? (
          <a href={docUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
            <i className="fa-solid fa-arrow-up-right-from-square" /> Original document
          </a>
        ) : null}
        {docUrl ? (
          <a href={docUrl} download className="btn btn-ghost btn-sm">
            <i className="fa-solid fa-file-arrow-down" /> Download original
          </a>
        ) : null}
        <a href={`/staff/agreements/signed/${acc.id}/download`} className="btn btn-primary btn-sm"><i className="fa-solid fa-file-pdf" /> Download signed PDF</a>
        <PrintButton label="Print" className="btn btn-ghost btn-sm" />
      </div>

      <div className="card card-pad print-sheet" id="cert">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            borderBottom: "1px solid var(--border)",
            paddingBottom: 16,
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-.3px" }}>AWIVEST</div>
            <div className="muted" style={{ fontSize: 12 }}>Certificate of acceptance</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="badge badge-good" style={{ fontSize: 11 }}>
              <i className={hasDrawn ? "fa-solid fa-signature" : "fa-solid fa-check"} />{" "}
              {hasDrawn ? "Signed" : "Accepted"}
            </span>
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Ref {String(acc.id).slice(0, 8).toUpperCase()}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".4px" }}>
            Agreement
          </div>
          <div style={{ fontWeight: 700, fontSize: 17, marginTop: 4 }}>
            {agr?.title || "Membership agreement"}
          </div>
          {agr?.description ? (
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{agr.description}</div>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
            gap: 14,
            marginTop: 20,
          }}
        >
          <Cell k="Member" v={memberName} />
          <Cell k="Member no." v={memberNo || "-"} />
          <Cell k="Email" v={member?.email || "-"} />
          <Cell k="Signed name" v={acc.signed_name || "-"} />
          <Cell k="Date signed" v={fmtDate(signedOn)} />
          <Cell k="Recorded" v={acc.signed_at ? new Date(acc.signed_at).toLocaleString("en-GB") : "-"} />
        </div>

        <div style={{ marginTop: 22 }}>
          <div
            className="muted"
            style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 8 }}
          >
            Signature
          </div>
          {hasDrawn ? (
            <div
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                display: "inline-block",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={acc.signature_image}
                alt="Member signature"
                style={{ display: "block", maxWidth: 320, maxHeight: 130 }}
              />
            </div>
          ) : (
            <div style={{ fontFamily: "Georgia, serif", fontSize: 24, fontStyle: "italic" }}>
              {acc.signed_name || memberName}
            </div>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Signed by {memberName}
            {signedOn ? " on " + fmtDate(signedOn) : ""}.
          </div>
        </div>

        <div
          className="muted"
          style={{ marginTop: 22, borderTop: "1px solid var(--border)", paddingTop: 12 }}
        >
          <div style={{ fontSize: 11 }}>
            This certificate records the member acceptance of the agreement above within the AWIVEST
            members portal. The original document is retained by the office.
          </div>
        </div>
      </div>
    </div>
  );
}
