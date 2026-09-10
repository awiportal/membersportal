import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSignedAgreementPdf } from "@/lib/signedPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /agreements/download/[id] -> the member's OWN signed agreement (original
// document + their signature page) as one PDF. Views inline by default so
// "View signed document" opens it in the browser; ?download=1 forces a download.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // A member may only fetch their own acceptance.
  const { data: acc } = await supabase
    .from("agreement_acceptances")
    .select("member_id")
    .eq("id", params.id)
    .single();
  if (!acc || acc.member_id !== user.id) return new Response("Forbidden", { status: 403 });

  const result = await buildSignedAgreementPdf(supabase, params.id);
  if (!result) return new Response("Not found", { status: 404 });

  const attach = new URL(req.url).searchParams.get("download") === "1";
  return new Response(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": (attach ? "attachment" : "inline") + '; filename="' + result.filename + '"',
      "Cache-Control": "no-store",
    },
  });
}
