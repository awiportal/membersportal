import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';
import { createMeeting } from './actions';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  agm: 'AGM',
  committee: 'Committee',
  general: 'General',
  special: 'Special',
  other: 'Other',
};
const STATUS_CLS: Record<string, string> = {
  scheduled: 'badge-info',
  held: 'badge-good',
  cancelled: 'badge-bad',
};

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

export default async function StaffMeetingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');

  const { data: rowsRaw } = await supabase
    .from('meetings')
    .select('*')
    .order('scheduled_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  const meetings = (rowsRaw ?? []) as any[];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="page-title">Meetings</div>
      <div className="sub">Plan and record committee and general meetings — agenda, minutes, attendance and action items.</div>

      <div className="card card-pad" style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Schedule a meeting</div>
        <form action={createMeeting} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', alignItems: 'end' }}>
          <div className="field" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label>Title</label>
            <input className="input" name="title" required placeholder="e.g. Q3 Committee Meeting" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Type</label>
            <select className="input" name="meeting_type" defaultValue="committee">
              <option value="committee">Committee</option>
              <option value="agm">AGM</option>
              <option value="general">General</option>
              <option value="special">Special</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Date &amp; time</label>
            <input className="input" type="datetime-local" name="scheduled_at" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Location</label>
            <input className="input" name="location" placeholder="e.g. Nairobi office / Zoom" />
          </div>
          <button className="btn btn-primary" type="submit" style={{ gridColumn: '1 / -1', justifySelf: 'start' }}>
            <i className="fa-solid fa-plus" /> Create meeting
          </button>
        </form>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>All meetings ({meetings.length})</div>
        {meetings.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No meetings yet — schedule one above.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                  <th scope="col" style={{ padding: '8px 10px' }}>Title</th>
                  <th scope="col" style={{ padding: '8px 10px' }}>Type</th>
                  <th scope="col" style={{ padding: '8px 10px' }}>When</th>
                  <th scope="col" style={{ padding: '8px 10px' }}>Status</th>
                  <th scope="col" style={{ padding: '8px 10px', textAlign: 'right' }} />
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 10px', fontWeight: 600 }}>{m.title}</td>
                    <td style={{ padding: '9px 10px' }}>{TYPE_LABEL[m.meeting_type] || m.meeting_type}</td>
                    <td className="muted" style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>{fmtWhen(m.scheduled_at)}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span className={'badge ' + (STATUS_CLS[m.status] || 'badge-info')}>{m.status}</span>
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                      <Link href={`/staff/meetings/${m.id}`} className="btn btn-ghost btn-sm"><i className="fa-solid fa-arrow-right" /> Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
