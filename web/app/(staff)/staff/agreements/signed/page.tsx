import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function fmtDate(v?: string | null) {
  if (v === undefined || v === null || v === "") return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const NIL = "00000000-0000-0000-0000-000000000000";

// Staff-only register of every agreement acceptance, newest first.
export default async function SignedAgreementsRegister() {
  const supabase = createClient();
  const { data: accRows } = await supabase
    .from("agreement_acceptances")
    .select("*")
    .order("signed_at", { ascending: false });

  const accepts = (accRows ?? []) as any[];
  const memberIds = Array.from(new Set(accepts.map((a) => a.member_id).filter(Boolean)));
  const agrIds = Array.from(new Set(accepts.map((a) => a.agreement_id).filter(Boolean)));

  const [{ data: members }, { data: agrs }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").in("id", memberIds.length ? memberIds : [NIL]),
    supabase.from("agreement_documents").select("id, title").in("id", agrIds.length ? agrIds : [NIL]),
  ]);
  const memById: Record<string, any> = {};
  ((members ?? []) as any[]).forEach((m) => (memById[m.id] = m));
  const agrById: Record<string, any> = {};
  ((agrs ?? []) as any[]).forEach((a) => (agrById[a.id] = a));

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Link href="/staff/agreements" className="btn btn-ghost btn-sm">
          <i className="fa-solid fa-arrow-left" /> Agreements
        </Link>
      </div>
      <div className="page-title" style={{ marginTop: 12 }}>Signed agreements</div>
      <div className="sub">
        Every agreement a member has signed, newest first. Preview the signed certificate or download it as a PDF.
      </div>

      <div className="card card-pad" style={{ marginTop: 20 }}>
        {accepts.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>
            No signed agreements yet. They appear here as members sign during onboarding.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {accepts.map((a) => {
              const mem = memById[a.member_id];
              const agr = agrById[a.agreement_id];
              const drawn =
                typeof a.signature_image === "string" && a.signature_image.startsWith("data:image");
              return (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: 13,
                    borderRadius: 13,
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      display: "grid",
                      placeItems: "center",
                      background: "var(--surface)",
                      color: "var(--lime2)",
                    }}
                  >
                    <i className="fa-solid fa-signature" />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600 }}>{mem?.full_name || a.signed_name || "Member"}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {agr?.title || "Agreement"} · {fmtDate(a.signed_date || a.signed_at)}
                    </div>
                  </div>
                  <span className={"badge " + (drawn ? "badge-good" : "badge-info")} style={{ fontSize: 11 }}>
                    {drawn ? "Drawn signature" : "Typed"}
                  </span>
                  <Link href={"/staff/agreements/signed/" + a.id} className="btn btn-ghost btn-sm">
                    <i className="fa-solid fa-eye" /> Preview
                  </Link>
                  <Link href={"/staff/agreements/signed/" + a.id} className="btn btn-primary btn-sm">
                    <i className="fa-solid fa-download" /> Download
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
