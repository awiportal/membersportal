import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStaff, isAdmin } from '@/lib/roles';
import {
  updateMeetingDetails,
  saveAgenda,
  saveMinutes,
  deleteMeeting,
  addAttendance,
  setAttendanceStatus,
  removeAttendance,
  addActionItem,
  setActionItemStatus,
  removeActionItem,
} from '../actions';

export const dynamic = 'force-dynamic';

const STATUS_CLS: Record<string, string> = { scheduled: 'badge-info', held: 'badge-good', cancelled: 'badge-bad' };
const AI_CLS: Record<string, string> = { open: 'badge-info', done: 'badge-good', cancelled: 'badge-bad' };

function toLocalInput(ts?: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDate(ts?: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function MeetingDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('id, role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');
  const admin = isAdmin(me?.role);

  const id = params.id;
  const { data: meeting } = await supabase.from('meetings').select('*').eq('id', id).maybeSingle();
  if (!meeting) notFound();
  const m = meeting as any;

  const [{ data: attRaw }, { data: aiRaw }, { data: peopleRaw }] = await Promise.all([
    supabase.from('meeting_attendance').select('*').eq('meeting_id', id).order('created_at', { ascending: true }),
    supabase.from('meeting_action_items').select('*').eq('meeting_id', id).order('created_at', { ascending: true }),
    supabase.from('profiles').select('id, full_name, email').order('full_name', { ascending: true }),
  ]);
  const attendance = (attRaw ?? []) as any[];
  const actionItems = (aiRaw ?? []) as any[];
  const people = (peopleRaw ?? []) as any[];
  const nameById = new Map(people.map((p) => [p.id, p.full_name || p.email || '—']));
  const attendedIds = new Set(attendance.filter((a) => a.member_id).map((a) => a.member_id));
  const availablePeople = people.filter((p) => !attendedIds.has(p.id));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Link href="/staff/meetings" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        <i className="fa-solid fa-arrow-left" /> All meetings
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div className="page-title">{m.title}</div>
          <div className="sub">{fmtDate(m.scheduled_at) || 'Date to be confirmed'}{m.location ? ' · ' + m.location : ''}</div>
        </div>
        <span className={'badge ' + (STATUS_CLS[m.status] || 'badge-info')}>{m.status}</span>
      </div>

      {/* Details */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Details</div>
        <form action={updateMeetingDetails} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', alignItems: 'end' }}>
          <input type="hidden" name="id" value={m.id} />
          <div className="field" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label>Title</label>
            <input className="input" name="title" defaultValue={m.title || ''} required />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Type</label>
            <select className="input" name="meeting_type" defaultValue={m.meeting_type || 'committee'}>
              <option value="committee">Committee</option>
              <option value="agm">AGM</option>
              <option value="general">General</option>
              <option value="special">Special</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Date &amp; time</label>
            <input className="input" type="datetime-local" name="scheduled_at" defaultValue={toLocalInput(m.scheduled_at)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Location</label>
            <input className="input" name="location" defaultValue={m.location || ''} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select className="input" name="status" defaultValue={m.status || 'scheduled'}>
              <option value="scheduled">Scheduled</option>
              <option value="held">Held</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <button className="btn btn-primary" type="submit" style={{ gridColumn: '1 / -1', justifySelf: 'start' }}>
            <i className="fa-solid fa-floppy-disk" /> Save details
          </button>
        </form>
        {admin && (
          <form action={deleteMeeting} style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <input type="hidden" name="id" value={m.id} />
            <button className="btn btn-ghost btn-sm" type="submit" title="Permanently delete this meeting">
              <i className="fa-solid fa-trash-can" /> Delete meeting
            </button>
          </form>
        )}
      </div>

      {/* Agenda + Minutes */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginBottom: 16 }}>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Agenda</div>
          <form action={saveAgenda}>
            <input type="hidden" name="id" value={m.id} />
            <textarea className="input" name="agenda" rows={10} defaultValue={m.agenda || ''} placeholder="1. Welcome and apologies&#10;2. Minutes of the previous meeting&#10;3. Matters arising" style={{ resize: 'vertical', fontFamily: 'inherit' }} />
            <button className="btn btn-primary btn-sm" type="submit" style={{ marginTop: 10 }}><i className="fa-solid fa-floppy-disk" /> Save agenda</button>
          </form>
        </div>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Minutes</div>
          <form action={saveMinutes}>
            <input type="hidden" name="id" value={m.id} />
            <textarea className="input" name="minutes" rows={10} defaultValue={m.minutes || ''} placeholder="Record decisions and discussion here." style={{ resize: 'vertical', fontFamily: 'inherit' }} />
            <button className="btn btn-primary btn-sm" type="submit" style={{ marginTop: 10 }}><i className="fa-solid fa-floppy-disk" /> Save minutes</button>
          </form>
        </div>
      </div>

      {/* Attendance */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Attendance ({attendance.length})</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Record who attended, sent apologies, or was absent.</div>
        <form action={addAttendance} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', alignItems: 'end', marginBottom: 14 }}>
          <input type="hidden" name="meeting_id" value={m.id} />
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Member</label>
            <select className="input" name="member_id" defaultValue="">
              <option value="">— Select member —</option>
              {availablePeople.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Or guest name</label>
            <input className="input" name="name" placeholder="Non-member guest" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select className="input" name="status" defaultValue="present">
              <option value="present">Present</option>
              <option value="apology">Apology</option>
              <option value="absent">Absent</option>
            </select>
          </div>
          <button className="btn btn-ghost" type="submit"><i className="fa-solid fa-user-plus" /> Add</button>
        </form>
        {attendance.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>No attendance recorded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {attendance.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {a.member_id ? (nameById.get(a.member_id) || a.name || '—') : (a.name || 'Guest')}
                  {!a.member_id && <span className="badge badge-purple" style={{ marginLeft: 8, fontSize: 10 }}>Guest</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <form action={setAttendanceStatus} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="meeting_id" value={m.id} />
                    <select name="status" defaultValue={a.status} className="input" style={{ width: 'auto', fontSize: 12.5, padding: '6px 10px' }}>
                      <option value="present">Present</option>
                      <option value="apology">Apology</option>
                      <option value="absent">Absent</option>
                    </select>
                    <button className="btn btn-ghost btn-sm" type="submit">Update</button>
                  </form>
                  <form action={removeAttendance}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="meeting_id" value={m.id} />
                    <button className="btn btn-ghost btn-sm" type="submit" title="Remove"><i className="fa-solid fa-xmark" /></button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action items */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Action items ({actionItems.length})</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Track tasks agreed at the meeting, who owns them, and when they are due.</div>
        <form action={addActionItem} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', alignItems: 'end', marginBottom: 14 }}>
          <input type="hidden" name="meeting_id" value={m.id} />
          <div className="field" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label>Task</label>
            <input className="input" name="description" required placeholder="e.g. Circulate the audited accounts" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Owner</label>
            <select className="input" name="assignee_id" defaultValue="">
              <option value="">— Unassigned —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Due date</label>
            <input className="input" type="date" name="due_date" />
          </div>
          <button className="btn btn-ghost" type="submit"><i className="fa-solid fa-plus" /> Add task</button>
        </form>
        {actionItems.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>No action items yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {actionItems.map((it) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: it.status === 'done' ? 'line-through' : undefined }}>{it.description}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {it.assignee_id ? (nameById.get(it.assignee_id) || 'Assigned') : (it.assignee_name || 'Unassigned')}
                    {it.due_date ? ' · due ' + fmtDate(it.due_date) : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className={'badge ' + (AI_CLS[it.status] || 'badge-info')} style={{ fontSize: 10.5 }}>{it.status}</span>
                  <form action={setActionItemStatus} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="meeting_id" value={m.id} />
                    <select name="status" defaultValue={it.status} className="input" style={{ width: 'auto', fontSize: 12.5, padding: '6px 10px' }}>
                      <option value="open">Open</option>
                      <option value="done">Done</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <button className="btn btn-ghost btn-sm" type="submit">Update</button>
                  </form>
                  <form action={removeActionItem}>
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="meeting_id" value={m.id} />
                    <button className="btn btn-ghost btn-sm" type="submit" title="Remove"><i className="fa-solid fa-xmark" /></button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
