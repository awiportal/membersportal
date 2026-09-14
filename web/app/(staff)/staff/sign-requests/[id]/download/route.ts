import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canViewStaffConsole, isAdmin } from '@/lib/roles';
import { buildSignedRequestPdf } from '@/lib/signedRequestPdf';
import { buildSignedSequencePdf, SIGN_BUCKET } from '@/lib/signedSequencePdf';
import { buildPositionedSignedPdf } from '@/lib/positionedSignPdf';
import { hasFieldLayout } from '@/lib/fieldLayout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /staff/sign-requests/[id]/download
//
// Three behaviours, disambiguated by the query string and what [id] resolves to:
//  - ORIGINAL preview (?original=1): [id] is a sign_requests id. Streams the
//    UNSIGNED original inline for an Admin/Chairlady OR any signer on that
//    request, so the positional signing overlay can render it. Purely additive.
//  - SEQUENTIAL: [id] is a sign_requests row with flow 'sequential'. Allowed for
//    an Admin/Chairlady OR any signer on that request, and only once the request
//    is completed. Returns the whole merged, fully-signed PDF — stamped with the
//    placed fields when the request carries a field_layout, otherwise the plain
//    ordered certificate output.
//  - INDIVIDUAL (unchanged): [id] is a sign_request_recipients id. Staff-only;
//    returns the merged PDF for that recipient (member + countersignature).
//
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
  const url = new URL(req.url);
  const attach = url.searchParams.get('download') === '1';
  const wantOriginal = url.searchParams.get('original') === '1';

  // ---- Original preview (unsigned): a signer or admin may view the source ----
  if (wantOriginal) {
    const { data: reqRow } = await admin
      .from('sign_requests')
      .select('id, file_path')
      .eq('id', params.id)
      .maybeSingle();
    if (!reqRow || !(reqRow as any).file_path) return new Response('Not found', { status: 404 });

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

    const { data: file } = await admin.storage.from(SIGN_BUCKET).download((reqRow as any).file_path);
    if (!file) return new Response('Not found', { status: 404 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="document.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  }

  // ---- Sequential flow ----
  const { data: seqReq } = await admin
    .from('sign_requests')
    .select('id, flow, completed_at, field_layout')
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

    // Stamp placed fields when the request carries a layout; otherwise keep the
    // original ordered-certificate output unchanged.
    const seq = hasFieldLayout((seqReq as any).field_layout)
      ? await buildPositionedSignedPdf(params.id)
      : await buildSignedSequencePdf(params.id);
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
