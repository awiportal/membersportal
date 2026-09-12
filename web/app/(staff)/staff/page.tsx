import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import MembersBrowser from "./MembersBrowser";

export const dynamic = "force-dynamic";

// Console hub: every card links to a Management console the staff can open.
// Keeps the landing a true command centre and makes cross-navigation one click.
const HUB: { href: string; ic: string; t: string; d: string; lime?: boolean }[] = [
  { href: "/staff/statements", ic: "fa-file-invoice-dollar", t: "Member statements", d: "Open, print and issue any member's statement." },
  { href: "/staff/fund-data", ic: "fa-database", t: "Fund data", d: "Post contributions, imports, withdrawals and exits.", lime: true },
  { href: "/staff/reports", ic: "fa-chart-column", t: "Reports & distribution", d: "Live fund position, breakdown and CSV export." },
  { href: "/staff/kyc", ic: "fa-id-card-clip", t: "KYC review", d: "Verify member identity documents." },
  { href: "/staff/withdrawals", ic: "fa-money-bill-wave", t: "Withdrawals", d: "Review, approve and mark payouts paid.", lime: true },
  { href: "/staff/welfare", ic: "fa-hand-holding-heart", t: "Welfare claims", d: "Assess and record welfare disbursements." },
  { href: "/staff/fund-records", ic: "fa-diagram-project", t: "Fund records", d: "Identifiers and register matching." },
  { href: "/staff/opportunities", ic: "fa-lightbulb", t: "Opportunities", d: "Publish and manage investment opportunities." },
];

export default async function StaffHome() {
  const supabase = createClient();
  const { data: members } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  const all = (members ?? []) as any[];
  const rows = all.map((m) => ({
    id: m.id as string,
    full_name: (m.full_name || "") as string,
    email: (m.email || "") as string,
    investor_id: (m.investor_id || "") as string,
    role: (m.role || "member") as string,
    title: (m.title ?? null) as string | null,
    status: (m.status || "") as string,
    onboarding_step: (m.onboarding_step || "") as string,
    submitted_at: (m.submitted_at ?? null) as string | null,
  }));

  return (
    <div>
      <div className="page-title">Approvals &amp; Members</div>
      <div className="sub">Review submitted membership packs, approve members, and manage the register.</div>
      <MembersBrowser members={rows} />

      <div className="hub-head">
        <div className="eyebrow">Jump to a console</div>
        <div className="line" />
      </div>
      <div className="tilegrid">
        {HUB.map((h) => (
          <Link key={h.href} href={h.href} className="tile">
            <span className={`tile-ic${h.lime ? " lime" : ""}`}>
              <i className={`fa-solid ${h.ic}`} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="tile-t">{h.t}</div>
              <div className="tile-d">{h.d}</div>
            </div>
            <i className="fa-solid fa-arrow-right tile-arrow" />
          </Link>
        ))}
      </div>
    </div>
  );
}
