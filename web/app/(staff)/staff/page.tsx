import { createClient } from "@/lib/supabase/server";
import MembersBrowser from "./MembersBrowser";

export const dynamic = "force-dynamic";

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
    status: (m.status || "") as string,
    onboarding_step: (m.onboarding_step || "") as string,
    submitted_at: (m.submitted_at ?? null) as string | null,
  }));

  return (
    <div>
      <div className="page-title">Approvals &amp; Members</div>
      <div className="sub">Review submitted membership packs, approve members, and manage the register.</div>
      <MembersBrowser members={rows} />
    </div>
  );
}
