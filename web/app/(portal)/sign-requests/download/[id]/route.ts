import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSignedRequestPdf } from '@/lib/signedRequestPdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /sign-requests/download/[id] -> the member's OWN completed document
// (original + signatures page with both signatures) as one PDF. Views inline by
// default; ?download=1 forces a download. 403 if the row is not the caller's.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  // A member may only fetch their own recipient row.
  const admin = createAdminClient();
  const { data: rcpt } = await admin
    .from('sign_request_recipients')
    .select('member_id')
    .eq('id', params.id)
    .single();
  if (!rcpt || rcpt.member_id !== user.id) return new Response('Forbidden', { status: 403 });

  const result = await buildSignedRequestPdf(params.id);
  if (!result) return new Response('Not found', { status: 404 });

  const attach = new URL(req.url).searchParams.get('download') === '1';
  return new Response(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': (attach ? 'attachment' : 'inline') + '; filename="' + result.filename + '"',
      'Cache-Control': 'no-store',
    },
  });
}
