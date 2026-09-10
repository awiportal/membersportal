"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { roleLabel, statusLabel } from "@/lib/roles";
import { approveMember } from "./actions";

type Row = {
  id: string;
  full_name: string;
  email: string;
  investor_id: string;
  role: string;
  status: string;
  onboarding_step: string;
  submitted_at: string | null;
};
type Filter = "awaiting" | "active" | "pending" | "all";

// A member is in the approval queue when they've submitted a complete pack and
// are still pending. Those rows keep an inline Approve action.
function isAwaiting(m: Row) {
  return m.status === "pending" && m.onboarding_step === "submitted";
}

function StatusBadge({ s }: { s?: string }) {
  const cls =
    s === "active" ? "badge-good" : s === "pending" ? "badge-warn" : s === "archived" ? "badge-purple" : "badge-bad";
  return <span className={`badge ${cls}`}>{statusLabel(s)}</span>;
}

function initials(name: string, email: string) {
  const base = (name || email || "M").trim();
  return base.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

export default function MembersBrowser({ members }: { members: Row[] }) {
  const [filter, setFilter] = useState<Filter>("awaiting");
  const [q, setQ] = useState("");

  const counts = useMemo(
    () => ({
      awaiting: members.filter(isAwaiting).length,
      active: members.filter((m) => m.status === "active").length,
      pending: members.filter((m) => m.status === "pending").length,
      all: members.length,
    }),
    [members]
  );

  const kpis: { key: Filter; label: string; icon: string; accent?: boolean; value: number }[] = [
    { key: "awaiting", label: "Awaiting approval", icon: "fa-user-clock", accent: true, value: counts.awaiting },
    { key: "active", label: "Active members", icon: "fa-user-check", value: counts.active },
    { key: "pending", label: "Pending members", icon: "fa-hourglass-half", value: counts.pending },
    { key: "all", label: "Total members", icon: "fa-users", value: counts.all },
  ];

  const filtered = useMemo(() => {
    let list = members;
    if (filter === "awaiting") list = list.filter(isAwaiting);
    else if (filter === "active") list = list.filter((m) => m.status === "active");
    else if (filter === "pending") list = list.filter((m) => m.status === "pending");
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((m) => `${m.full_name} ${m.email} ${m.investor_id}`.toLowerCase().includes(term));
    return list;
  }, [members, filter, q]);

  const heading =
    filter === "awaiting"
      ? "Awaiting approval"
      : filter === "active"
      ? "Active members"
      : filter === "pending"
      ? "Pending members"
      : "All members";
  const subtext =
    filter === "awaiting"
      ? "Members who submitted a complete pack for committee approval."
      : filter === "all"
      ? "Everyone on the register."
      : `Members with ${statusLabel(filter).toLowerCase()} status.`;
  const emptyText =
    filter === "awaiting"
      ? "No packs waiting. You're all caught up."
      : q.trim()
      ? "No members match your search."
      : "No members in this group yet.";

  return (
    <>
      {/* KPI tiles double as filters — click one to load those members below */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", margin: "22px 0 20px" }}>
        {kpis.map((k) => {
          const selected = filter === k.key;
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setFilter(k.key)}
              aria-pressed={selected}
              className="card kpi hover-lift"
              style={{
                textAlign: "left",
                cursor: "pointer",
                font: "inherit",
                color: "inherit",
                border: selected ? "1px solid var(--lime2)" : "1px solid var(--border)",
                boxShadow: selected ? "0 0 0 1px var(--lime2) inset, 0 10px 30px -18px rgba(0,0,0,0.6)" : undefined,
                background: selected ? "linear-gradient(135deg, rgba(166,205,53,0.16), rgba(126,38,116,0.12))" : undefined,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span className="lbl">{k.label}</span>
                <span
                  className={`ic ${k.accent ? "grad-lime" : ""}`}
                  style={{ background: k.accent ? undefined : "var(--surface2)", color: k.accent ? "#20260a" : "var(--lime2)" }}
                >
                  <i className={`fa-solid ${k.icon}`} />
                </span>
              </div>
              <div className="val num">{k.value}</div>
              <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600, color: selected ? "var(--lime2)" : "var(--muted)" }}>
                {selected ? (
                  <>
                    <i className="fa-solid fa-circle-check" /> Showing below
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-arrow-pointer" /> Click to view
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filtered register */}
      <div className="card card-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{heading}</div>
          <span className="badge badge-purple">{filtered.length}</span>
          <label className="search" style={{ marginLeft: "auto", maxWidth: 280, flex: "1 1 200px" }}>
            <i className="fa-solid fa-magnifying-glass" />
            <input
              placeholder="Search name, email or ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search members"
              style={{ background: "transparent", border: 0, outline: "none", color: "inherit", width: "100%", fontFamily: "inherit", fontSize: 13.5 }}
            />
          </label>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>{subtext}</div>

        {filtered.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: "8px 2px" }}>{emptyText}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr className="muted" style={{ textAlign: "left", fontSize: 12 }}>
                  <th style={{ padding: "8px 10px" }}>Name</th>
                  <th style={{ padding: "8px 10px" }}>Investor ID</th>
                  <th style={{ padding: "8px 10px" }}>Role</th>
                  <th style={{ padding: "8px 10px" }}>Status</th>
                  <th style={{ padding: "8px 10px" }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="avatar" style={{ width: 34, height: 34, fontSize: 12, flex: "0 0 auto" }}>{initials(m.full_name, m.email)}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{m.full_name || "—"}</div>
                          <div className="muted" style={{ fontSize: 11.5 }}>{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px" }} className="num">{m.investor_id || "—"}</td>
                    <td style={{ padding: "10px" }}>{roleLabel(m.role)}</td>
                    <td style={{ padding: "10px" }}><StatusBadge s={m.status} /></td>
                    <td style={{ padding: "10px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {isAwaiting(m) ? (
                        <form action={approveMember} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={m.id} />
                          <button className="btn btn-lime btn-sm" type="submit" style={{ marginRight: 8 }}>
                            <i className="fa-solid fa-check" /> Approve
                          </button>
                        </form>
                      ) : null}
                      <Link href={`/staff/members/${m.id}`} className="btn btn-ghost btn-sm">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
