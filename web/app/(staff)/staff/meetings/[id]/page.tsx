import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdmin, canViewStaffConsole } from '@/lib/roles';
import { dailyConfigured } from '@/lib/daily';
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
  createLiveRoom,
  refreshRecordings,
} from '../actions';

export const dynamic = 'force-dynamic';

const STATUS_CLS: Record<string, string> = { scheduled: 'badge-info', held: 'badge-good', cancelled: 'badge-bad' };
const AI_CLS: Record<string, string> = { open: 'badge-info', done: 'badge-good', cancelled: 'badge-bad' };
const PROVIDER_LABEL: Record<string, string> = { none: 'None', meet: 'Google Meet', zoom: 'Zoom', other: 'Other', daily: 'Daily (in-portal)' };

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
function fmtDateTime(ts?: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDuration(secs?: number | null): string {
  if (!secs || secs <= 0) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default async function MeetingDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('id, role').eq('id', user.id).single();
  if (!canViewStaffConsole(me?.role)) redirect('/staff');
  const admin = isAdmin(me?.role);

  const id = params.id;
  const { data: meeting } = await supabase.from('meetings').select('*').eq('id', id).maybeSingle();
  if (!meeting) notFound();
  const m = meeting as any;

  const [{ data: attRaw }, { data: aiRaw }, { data: peopleRaw }, { data: recRaw }] = await Promise.all([
    supabase.from('meeting_attendance').select('*').eq('meeting_id', id).order('created_at', { ascending: true }),
    supabase.from('meeting_action_items').select('*').eq('meeting_id', id).order('created_at', { ascending: true }),
    supabase.from('profiles').select('id, full_name, email').order('full_name', { ascending: true }),
    supabase.from('meeting_recordings').select('*').eq('meeting_id', id).order('created_at', { ascending: false }),
  ]);
  const attendance = (attRaw ?? []) as any[];
  const actionItems = (aiRaw ?? []) as any[];
  const people = (peopleRaw ?? []) as any[];
  const recordings = (recRaw ?? []) as any[];
  const nameById = new Map(people.map((p) => [p.id, p.full_name || p.email || '—']));
  const attendedIds = new Set(attendance.filter((a) => a.member_id).map((a) => a.member_id));
  const availablePeople = people.filter((p) => !attendedIds.has(p.id));
  const dailyReady = m.meeting_provider === 'daily' && !!m.meeting_link;

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

      {/* Join meeting */}
      {m.meeting_link ? (
        <div className="card card-pad" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              Video meeting
              {m.meeting_provider && m.meeting_provider !== 'none' ? <span className="badge badge-info" style={{ marginLeft: 8, fontSize: 10.5 }}>{PROVIDER_LABEL[m.meeting_provider] || m.meeting_provider}</span> : null}
              {m.member_visible ? <span className="badge badge-good" style={{ marginLeft: 8, fontSize: 10.5 }}>Shown to members</span> : null}
            </div>
            {m.meeting_passcode ? <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Passcode: {m.meeting_passcode}</div> : null}
          </div>
          <a href={m.meeting_link} target="_blank" rel="noopener" className="btn btn-primary"><i className="fa-solid fa-video" /> Join meeting</a>
        </div>
      ) : null}

      {/* In-portal live room (Daily) */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>In-portal live room</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Host the meeting inside the portal with Daily video and cloud recording. Recordings are pulled on demand.
        </div>
        {dailyReady ? (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Link href={`/staff/meetings/${m.id}/live`} className="btn btn-primary btn-sm">
                <i className="fa-solid fa-video" /> Open live room
              </Link>
              <form action={refreshRecordings} style={{ display: 'inline' }}>
                <input type="hidden" name="meeting_id" value={m.id} />
                <button className="btn btn-ghost btn-sm" type="submit">
                  <i className="fa-solid fa-rotate" /> Refresh recordings
                </button>
              </form>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>
                Recordings ({recordings.length})
              </div>
              {recordings.length === 0 ? (
                <div className="muted" style={{ fontSize: 12.5 }}>
                  No recordings yet. Cloud recordings appear here after a session is recorded and you click Refresh recordings.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recordings.map((r) => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div style={{ fontSize: 13 }}>
                        <span className={'badge ' + (r.status === 'ready' || r.status === 'finished' ? 'badge-good' : 'badge-info')} style={{ fontSize: 10.5, marginRight: 8 }}>{r.status}</span>
                        {fmtDateTime(r.started_at) || fmtDateTime(r.created_at) || '—'}
                        {r.duration_seconds ? <span className="muted"> · {fmtDuration(r.duration_seconds)}</span> : null}
                      </div>
                      <a href={`/staff/meetings/${m.id}/recording/${r.id}`} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">
                        <i className="fa-solid fa-download" /> Download
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <form action={createLiveRoom}>
            <input type="hidden" name="meeting_id" value={m.id} />
            <button className="btn btn-primary btn-sm" type="submit" disabled={!dailyConfigured()}>
              <i className="fa-solid fa-video" /> Create live room
            </button>
            {!dailyConfigured() ? (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Set DAILY_API_KEY to enable in-portal live rooms.</div>
            ) : null}
          </form>
        )}
      </div>

      {/* Details */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Details</div>
        <form action={updateMeetingDetails} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', alignItems: 'end' }}>
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="has_video" value="1" />
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
          <div className="field" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label>Video link (Zoom / Google Meet)</label>
            <input className="input" name="meeting_link" defaultValue={m.meeting_link || ''} placeholder="https://…" />
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <a href="https://meet.google.com/new" target="_blank" rel="noopener"><i className="fa-solid fa-video" /> New Google Meet</a>
              <a href="https://zoom.us/start/webmeeting" target="_blank" rel="noopener"><i className="fa-solid fa-video" /> New Zoom</a>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Provider</label>
            <select className="input" name="meeting_provider" defaultValue={m.meeting_provider || 'none'}>
              <option value="none">None</option>
              <option value="meet">Google Meet</option>
              <option value="zoom">Zoom</option>
              <option value="other">Other</option>
              <option value="daily">Daily (in-portal)</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Passcode (optional)</label>
            <input className="input" name="meeting_passcode" defaultValue={m.meeting_passcode || ''} />
          </div>
          <div className="field" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" name="member_visible" defaultChecked={!!m.member_visible} /> Show to members with a Join button
            </label>
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
