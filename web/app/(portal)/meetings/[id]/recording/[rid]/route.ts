import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRecordingAccessLink } from '@/lib/daily';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Member recording download: fetch a fresh, short-lived Daily access link and
// redirect to it. The meeting_recordings_member_visible RLS policy only returns
// the row when the parent meeting is member_visible, so a member can never pull
// a link for a recording they aren't allowed to see.
export async function GET(req: Request, { params }: { params: { id: string; rid: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const { data: rec } = await supabase
    .from('meeting_recordings')
    .select('id, meeting_id, recording_ref')
    .eq('id', params.rid)
    .eq('meeting_id', params.id)
    .maybeSingle();
  const r = rec as any;
  if (!r || !r.recording_ref) return NextResponse.redirect(new URL('/meetings', req.url));

  try {
    const link = await getRecordingAccessLink(r.recording_ref);
    return NextResponse.redirect(link);
  } catch (e: any) {
    console.error('member recording access-link failed:', e?.message || e);
    return NextResponse.redirect(new URL('/meetings', req.url));
  }
}
