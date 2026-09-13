import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canViewStaffConsole } from '@/lib/roles';
import { getRecordingAccessLink } from '@/lib/daily';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Staff recording download: fetch a fresh, short-lived Daily access link and
// redirect to it. The meeting_recordings_staff RLS policy returns any recording
// row to staff; access to the staff console is gated by canViewStaffConsole.
export async function GET(req: Request, { params }: { params: { id: string; rid: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!canViewStaffConsole(me?.role)) return NextResponse.redirect(new URL('/staff', req.url));

  const { data: rec } = await supabase
    .from('meeting_recordings')
    .select('id, meeting_id, recording_ref')
    .eq('id', params.rid)
    .eq('meeting_id', params.id)
    .maybeSingle();
  const r = rec as any;
  if (!r || !r.recording_ref) return NextResponse.redirect(new URL(`/staff/meetings/${params.id}`, req.url));

  try {
    const link = await getRecordingAccessLink(r.recording_ref);
    return NextResponse.redirect(link);
  } catch (e: any) {
    console.error('staff recording access-link failed:', e?.message || e);
    return NextResponse.redirect(new URL(`/staff/meetings/${params.id}`, req.url));
  }
}
