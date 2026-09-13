import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  agm: 'AGM',
  committee: 'Committee',
  general: 'General',
  special: 'Special',
  other: 'Other',
};
const PROVIDER_LABEL: Record<string, string> = { none: '', meet: 'Google Meet', zoom: 'Zoom', other: 'Other', daily: 'Live room' };

function fmtWhen(ts?: string | null) {
  if (!ts) return 'Date to be confirmed';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return 'Date to be confirmed';
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(secs?: number | null): string {
  if (!secs || secs <= 0) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function MeetingCard({ m, recordings }: { m: any; recordings: any[] }) {
  const provider = PROVIDER_LABEL[m.meeting_provider] || '';
  const isDaily = m.meeting_provider === 'daily';
  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{m.title}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge badge-info" style={{ fontSize: 10.5 }}>{TYPE_LABEL[m.meeting_type] || m.meeting_type}</span>
            <span>{fmtWhen(m.scheduled_at)}</span>
            {m.location ? <span>· {m.location}</span> : null}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isDaily ? (
            <Link href={`/meetings/${m.id}/live`} className="btn btn-primary">
              <i className="fa-solid fa-video" /> Join live room
            </Link>
          ) : null}
          {m.meeting_link ? (
            <a href={m.meeting_link} target="_blank" rel="noopener" className={isDaily ? 'btn btn-ghost' : 'btn btn-primary'}>
              <i className="fa-solid fa-video" /> {isDaily ? 'Open in new tab' : 'Join meeting'}
            </a>
          ) : null}
        </div>
      </div>
      {m.meeting_link && (provider || m.meeting_passcode) ? (
        <div className="muted" style={{ fontSize: 12, marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {provider ? <span>{provider}</span> : null}
          {m.meeting_passcode ? <span>Passcode: {m.meeting_passcode}</span> : null}
        </div>
      ) : null}
      {m.agenda ? (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Agenda</div>
          <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{m.agenda}</div>
        </div>
      ) : null}
      {recordings && recordings.length > 0 ? (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Recordings</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recordings.map((r: any) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13 }}>
                  {fmtWhen(r.started_at || r.created_at)}
                  {r.duration_seconds ? <span className="muted"> · {fmtDuration(r.duration_seconds)}</span> : null}
                </div>
                <a href={`/meetings/${m.id}/recording/${r.id}`} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">
                  <i className="fa-solid fa-download" /> Download
                </a>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default async function MemberMeetingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS (meetings_member_visible) restricts this to member_visible rows; the
  // explicit filter mirrors that so intent is clear.
  const { data: rowsRaw } = await supabase
    .from('meetings')
    .select('id,title,meeting_type,scheduled_at,location,agenda,status,meeting_link,meeting_provider,meeting_passcode')
    .eq('member_visible', true)
    .order('scheduled_at', { ascending: true, nullsFirst: false });
  const meetings = (rowsRaw ?? []) as any[];

  // Load member-visible recordings (meeting_recordings_member_visible RLS only
  // returns rows whose meeting is member_visible) and group them per meeting.
  const recByMeeting = new Map<string, any[]>();
  const meetingIds = meetings.map((m) => m.id);
  if (meetingIds.length) {
    const { data: recRaw } = await supabase
      .from('meeting_recordings')
      .select('id, meeting_id, status, duration_seconds, started_at, created_at')
      .in('meeting_id', meetingIds)
      .order('created_at', { ascending: false });
    for (const r of (recRaw ?? []) as any[]) {
      const arr = recByMeeting.get(r.meeting_id) || [];
      arr.push(r);
      recByMeeting.set(r.meeting_id, arr);
    }
  }

  const now = Date.now();
  const isUpcoming = (m: any) => {
    if (m.status === 'cancelled') return false;
    if (!m.scheduled_at) return true;
    const d = new Date(m.scheduled_at);
    return isNaN(d.getTime()) ? true : d.getTime() >= now;
  };
  const upcoming = meetings.filter(isUpcoming);
  const past = meetings.filter((m) => !isUpcoming(m));

  return (
    <div>
      <div className="page-title">Meetings</div>
      <div className="sub">Meetings the AWIVEST office has shared with members — join online where a link is provided.</div>

      {meetings.length === 0 ? (
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="muted" style={{ fontSize: 13 }}>No meetings have been shared with you yet.</div>
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          {upcoming.length > 0 ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Upcoming</div>
              {upcoming.map((m) => (
                <MeetingCard key={m.id} m={m} recordings={recByMeeting.get(m.id) || []} />
              ))}
            </>
          ) : null}
          {past.length > 0 ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, margin: '22px 0 10px' }}>Past &amp; other</div>
              {past.map((m) => (
                <MeetingCard key={m.id} m={m} recordings={recByMeeting.get(m.id) || []} />
              ))}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
