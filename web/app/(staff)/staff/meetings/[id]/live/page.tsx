import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canViewStaffConsole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function StaffMeetingLive({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!canViewStaffConsole(me?.role)) redirect('/staff');

  const id = params.id;
  const { data: meeting } = await supabase.from('meetings').select('*').eq('id', id).maybeSingle();
  const m = meeting as any;

  if (!m || m.meeting_provider !== 'daily' || !m.meeting_link) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Link href={`/staff/meetings/${id}`} className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
          <i className="fa-solid fa-arrow-left" /> Back to meeting
        </Link>
        <div className="card card-pad">
          <div className="muted" style={{ fontSize: 13 }}>
            This meeting does not have an in-portal live room yet. Create one from the meeting page.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="page-title">{m.title}</div>
          <div className="sub">In-portal live room</div>
        </div>
        <Link href={`/staff/meetings/${id}`} className="btn btn-ghost btn-sm">
          <i className="fa-solid fa-arrow-left" /> Back to meeting
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
