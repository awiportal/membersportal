import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canViewStaffConsole } from '@/lib/roles';
import { buildSignedRequestPdf } from '@/lib/signedRequestPdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /staff/sign-requests/[id]/download -> the merged PDF (original + a
// signatures page carrying both signatures) for one recipient. Staff-only.
// Views inline by default; ?download=1 forces a download.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!canViewStaffConsole((me as any)?.role)) return new Response('Forbidden', { status: 403 });

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
