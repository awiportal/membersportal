import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function MemberMeetingLive({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const id = params.id;
  // The meetings_member_visible RLS policy returns this row only when the
  // meeting is member_visible; otherwise the select comes back empty and we
  // bounce the member back to the meetings list.
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id,title,meeting_link,meeting_provider')
    .eq('id', id)
    .maybeSingle();
  const m = meeting as any;
  if (!m || m.meeting_provider !== 'daily' || !m.meeting_link) redirect('/meetings');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="page-title">{m.title}</div>
          <div className="sub">Live video room</div>
        </div>
        <Link href="/meetings" className="btn btn-ghost btn-sm">
          <i className="fa-solid fa-arrow-left" /> Back to meetings
        </Link>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <iframe
          src={m.meeting_link}
          allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
          style={{ width: '100%', height: '80vh', border: 0, borderRadius: 12 }}
        />
      </div>
    </div>
  );
}
