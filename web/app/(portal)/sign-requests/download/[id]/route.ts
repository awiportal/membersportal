import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSignedRequestPdf } from '@/lib/signedRequestPdf';
import { buildSignedSequencePdf, SIGN_BUCKET } from '@/lib/signedSequencePdf';
import { buildPositionedSignedPdf } from '@/lib/positionedSignPdf';
import { hasFieldLayout } from '@/lib/fieldLayout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /sign-requests/download/[id]
//
//  - ORIGINAL preview (?original=1): [id] is a sign_requests id. Streams the
//    UNSIGNED original inline for a signer on that request, so the positional
//    signing overlay can render it. Purely additive.
//  - INDIVIDUAL (unchanged): [id] is the caller's OWN recipient row. Returns the
//    original + signatures page (member + countersignature) as one PDF. 403 if
//    the row is not the caller's.
//  - SEQUENTIAL (additive): ?sequence=<requestId> streams the fully-signed
//    ordered PDF. Allowed only if the caller is a signer on that request AND the
//    request is completed. Stamped with the placed fields when the request carries
//    a field_layout, otherwise the plain ordered certificate output. [id] is
//    ignored in this branch.
//
// Views inline by default; ?download=1 forces a download.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const admin = createAdminClient();
  const url = new URL(req.url);
  const attach = url.searchParams.get('download') === '1';
  const wantOriginal = url.searchParams.get('original') === '1';
  const sequenceId = (url.searchParams.get('sequence') || '').trim();

  // ---- Original preview (unsigned): a signer may view the source to fill fields ----
  if (wantOriginal) {
    const requestId = params.id;
    const { data: mine } = await admin
      .from('sign_request_steps')
      .select('id')
      .eq('request_id', requestId)
      .eq('signer_id', user.id)
      .limit(1);
    if (!mine || (mine as any[]).length === 0) return new Response('Forbidden', { status: 403 });

    const { data: reqRow } = await admin
      .from('sign_requests')
      .select('id, file_path')
      .eq('id', requestId)
      .maybeSingle();
    if (!reqRow || !(reqRow as any).file_path) return new Response('Not found', { status: 404 });

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

  // ---- Sequential download (participant, completed only) ----
  if (sequenceId) {
    const { data: reqRow } = await admin
      .from('sign_requests')
      .select('id, completed_at, field_layout')
      .eq('id', sequenceId)
      .maybeSingle();
    if (!reqRow) return new Response('Not found', { status: 404 });

    const { data: mine } = await admin
      .from('sign_request_steps')
      .select('id')
      .eq('request_id', sequenceId)
      .eq('signer_id', user.id)
      .limit(1);
    if (!mine || (mine as any[]).length === 0) return new Response('Forbidden', { status: 403 });
    if (!(reqRow as any).completed_at) {
      return new Response('This document is not fully signed yet.', { status: 403 });
    }

    const seq = hasFieldLayout((reqRow as any).field_layout)
      ? await buildPositionedSignedPdf(sequenceId)
      : await buildSignedSequencePdf(sequenceId);
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

  // ---- Individual download (unchanged): a member may only fetch their own row ----
  const { data: rcpt } = await admin
    .from('sign_request_recipients')
    .select('member_id')
    .eq('id', params.id)
    .single();
  if (!rcpt || rcpt.member_id !== user.id) return new Response('Forbidden', { status: 403 });

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
