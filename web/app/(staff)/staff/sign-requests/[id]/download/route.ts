import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canViewStaffConsole, isAdmin } from '@/lib/roles';
import { buildSignedRequestPdf } from '@/lib/signedRequestPdf';
import { buildSignedSequencePdf } from '@/lib/signedSequencePdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /staff/sign-requests/[id]/download
//
// Two behaviours, disambiguated by what [id] resolves to:
//  - SEQUENTIAL: [id] is a sign_requests row with flow 'sequential'. Allowed for
//    an Admin/Chairlady OR any signer on that request, and only once the request
//    is completed. Returns the whole merged, fully-signed PDF.
//  - INDIVIDUAL (unchanged): [id] is a sign_request_recipients id. Staff-only;
//    returns the merged PDF for that recipient (member + countersignature).
//
// The sequential branch is purely additive — an individual recipient id never
// matches a sign_requests row, so the original behaviour below is untouched.
// Views inline by default; ?download=1 forces a download.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = (me as any)?.role;

  const admin = createAdminClient();
  const attach = new URL(req.url).searchParams.get('download') === '1';

  // ---- Sequential flow ----
  const { data: seqReq } = await admin
    .from('sign_requests')
    .select('id, flow, completed_at')
    .eq('id', params.id)
    .maybeSingle();
  if (seqReq && (seqReq as any).flow === 'sequential') {
    let allowed = isAdmin(role);
    if (!allowed) {
      const { data: mine } = await admin
        .from('sign_request_steps')
        .select('id')
        .eq('request_id', params.id)
        .eq('signer_id', user.id)
        .limit(1);
      allowed = !!(mine && (mine as any[]).length);
    }
    if (!allowed) return new Response('Forbidden', { status: 403 });
    if (!(seqReq as any).completed_at) {
      return new Response('This document is not fully signed yet.', { status: 403 });
    }

    const seq = await buildSignedSequencePdf(params.id);
    if (!seq) return new Response('Not found', { status: 404 });
    return new Response(Buffer.from(seq.bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': (attach ? 'attachment' : 'inline') + '; filename="' + seq.filename + '"',
        'Cache-Control': 'no-store',
      },
    });
  }

  // ---- Individual flow (unchanged): [id] is a recipient id. Staff-only. ----
  if (!canViewStaffConsole(role)) return new Response('Forbidden', { status: 403 });

  const result = await buildSignedRequestPdf(params.id);
  if (!result) return new Response('Not found', { status: 404 });

  return new Response(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': (attach ? 'attachment' : 'inline') + '; filename="' + result.filename + '"',
      'Cache-Control': 'no-store',
    },
  });
}
