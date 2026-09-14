// Phase 5b — server-side Word (.docx) -> exact-layout PDF conversion.
//
// The SEQUENTIAL "Documents to Sign" builder POSTs an uploaded .docx here; we
// convert it to a PDF via CloudConvert (LibreOffice engine) and stream the PDF
// back. The client then feeds that converted PDF into the EXISTING Phase 5a
// field-placement + signing flow unchanged.
//
// Auth reuses the same server-side pattern as
// web/app/(staff)/staff/sign-requests/actions.ts (createClient from
// '@/lib/supabase/server' -> auth.getUser() -> load profiles.role), gated on
// isStaff / STAFF_ROLES.

import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';
import { convertDocxToPdf } from '@/lib/cloudconvert';

// Node runtime: convertDocxToPdf uses process.env and streams binary bodies,
// neither of which belongs on the Edge runtime. Allow up to 60s for the
// LibreOffice conversion + download round-trip.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  // 1) Auth — signed-in staff only (same pattern as actions.ts).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'not_signed_in' }, { status: 401 });
  }
  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!isStaff((me as any)?.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // 2) Validate the uploaded file: must be a .docx File.
  const form = await req.formData();
  const f = form.get('file');
  if (!(f instanceof File) || f.size === 0) {
    return Response.json({ error: 'no_file' }, { status: 400 });
  }
  if (!/\.docx$/i.test(f.name)) {
    return Response.json({ error: 'not_a_docx' }, { status: 400 });
  }

  const bytes = new Uint8Array(await f.arrayBuffer());

  // 3) Convert and return the PDF bytes.
  try {
    const pdf = await convertDocxToPdf(bytes, f.name);
    return new Response(pdf as BodyInit, {
      headers: { 'Content-Type': 'application/pdf' },
    });
  } catch (err: any) {
    const message = err?.message ? String(err.message) : 'conversion_failed';
    if (message === 'CLOUDCONVERT_NOT_CONFIGURED') {
      return Response.json({ error: 'not_configured' }, { status: 503 });
    }
    return Response.json({ error: message }, { status: 502 });
  }
}
