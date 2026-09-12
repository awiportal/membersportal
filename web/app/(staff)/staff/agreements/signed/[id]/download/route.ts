import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewStaffConsole } from "@/lib/roles";
import { buildSignedAgreementPdf } from "@/lib/signedPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /staff/agreements/signed/[id]/download -> original document + signature
// page, as one PDF. Staff-only. Downloads by default; ?download=0 views inline.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!canViewStaffConsole(me?.role)) return new Response("Forbidden", { status: 403 });

  const result = await buildSignedAgreementPdf(supabase, params.id);
  if (!result) return new Response("Not found", { status: 404 });

  const inline = new URL(req.url).searchParams.get("download") === "0";
  return new Response(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": (inline ? "inline" : "attachment") + '; filename="' + result.filename + '"',
      "Cache-Control": "no-store",
    },
  });
}
