'use client';
import { useRef, useState } from 'react';
import { createPost, updatePost, togglePublish, togglePin, deletePost } from './actions';

const CATS = [
  { id: 'announcement', label: 'Announcement', icon: 'fa-bullhorn', cls: 'badge-purple' },
  { id: 'news', label: 'News', icon: 'fa-newspaper', cls: 'badge-info' },
  { id: 'event', label: 'Event', icon: 'fa-calendar-day', cls: 'badge-lime' },
  { id: 'update', label: 'Update', icon: 'fa-arrows-rotate', cls: 'badge-good' },
];
const catMeta = (id: string) => CATS.find((c) => c.id === id) || CATS[0];

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 7 };

function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

export default function InfoManager({ rows }: { rows: any[] }) {
  const [editing, setEditing] = useState<any | null>(null);
  const [category, setCategory] = useState('announcement');
  const formRef = useRef<HTMLFormElement>(null);

  function startEdit(p: any) {
    setEditing(p);
    setCategory(p.category || 'announcement');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reset() {
    setEditing(null);
    setCategory('announcement');
    formRef.current?.reset();
  }
  async function submit(fd: FormData) {
    if (editing) await updatePost(fd);
    else await createPost(fd);
    reset();
  }

  const total = rows.length;
  const published = rows.filter((r) => r.published).length;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="page-title">Information Center</div>
      <div className="sub">Publish announcements, news, events and updates. Anything you publish appears for every member.</div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', margin: '22px 0 18px' }}>
        <div className="card kpi hover-lift"><span className="lbl">Total posts</span><div className="val">{total}</div></div>
        <div className="card kpi hover-lift"><span className="lbl">Published</span><div className="val">{published}</div></div>
        <div className="card kpi hover-lift"><span className="lbl">Drafts</span><div className="val">{total - published}</div></div>
      </div>

      {/* Composer */}
      <div className="card card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{editing ? 'Edit post' : 'New post'}</div>
          {editing && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}><i className="fa-solid fa-plus" /> New post</button>
          )}
        </div>

        <form ref={formRef} action={submit}>
          {editing && <input type="hidden" name="id" value={editing.id} />}

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            <label>
              <span style={labelStyle}>Category</span>
              <select className="input" name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATS.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}
              </select>
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Title</span>
              <input className="input" name="title" required defaultValue={editing?.title || ''} placeholder="e.g. AGM confirmed for 30 November" />
            </label>
          </div>

          <label style={{ display: 'block', marginTop: 14 }}>
            <span style={labelStyle}>Body</span>
            <textarea className="input" name="body" rows={5} defaultValue={editing?.body || ''} placeholder="Write the details members will read…" style={{ resize: 'vertical', fontFamily: 'inherit' }} />
          </label>

          {category === 'event' && (
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', marginTop: 14 }}>
              <label>
                <span style={labelStyle}>Event date &amp; time</span>
                <input className="input" type="datetime-local" name="event_at" defaultValue={toLocalInput(editing?.event_at)} />
              </label>
              <label>
                <span style={labelStyle}>Location</span>
                <input className="input" name="event_location" defaultValue={editing?.event_location || ''} placeholder="e.g. AWIVEST offices / Zoom" />
              </label>
            </div>
          )}

          <label style={{ display: 'block', marginTop: 14 }}>
            <span style={labelStyle}>Link (optional)</span>
            <input className="input" name="link_url" type="url" defaultValue={editing?.link_url || ''} placeholder="https://…" />
          </label>

          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" name="pinned" defaultChecked={!!editing?.pinned} /> Pin to top
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" name="published" defaultChecked={editing ? !!editing.published : true} /> Publish (visible to members)
            </label>
            <button type="submit" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}>
              <i className="fa-solid fa-paper-plane" /> {editing ? 'Save changes' : 'Post'}
            </button>
          </div>
        </form>
      </div>

      {/* Existing posts */}
      <div style={{ fontWeight: 800, fontSize: 16, margin: '24px 0 12px' }}>All posts</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.length === 0 && <div className="card card-pad muted" style={{ fontSize: 13 }}>No posts yet — create your first above.</div>}
        {rows.map((p) => {
          const m = catMeta(p.category);
          const date = p.published_at || p.created_at;
          return (
            <div key={p.id} className="card card-pad" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <span className="ic" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--surface2)', color: 'var(--text)', flexShrink: 0 }}>
                <i className={`fa-solid ${m.icon}`} />
              </span>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`badge ${m.cls}`} style={{ fontSize: 10.5 }}>{m.label}</span>
                  {p.pinned && <span className="badge badge-lime" style={{ fontSize: 10.5 }}><i className="fa-solid fa-thumbtack" /> Pinned</span>}
                  <span className={`badge ${p.published ? 'badge-good' : 'badge-warn'}`} style={{ fontSize: 10.5 }}>{p.published ? 'Published' : 'Draft'}</span>
                </div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{p.title}</div>
                {p.body && (
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2, whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.body}</div>
                )}
                <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                  {fmtDate(date)}{p.category === 'event' && p.event_at ? ' · event ' + fmtDate(p.event_at) : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(p)}><i className="fa-solid fa-pen" /> Edit</button>
                <form action={togglePublish}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="publish" value={p.published ? 'false' : 'true'} />
                  <button type="submit" className="btn btn-ghost btn-sm">{p.published ? (<><i className="fa-solid fa-eye-slash" /> Unpublish</>) : (<><i className="fa-solid fa-eye" /> Publish</>)}</button>
                </form>
                <form action={togglePin}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="pin" value={p.pinned ? 'false' : 'true'} />
                  <button type="submit" className="btn btn-ghost btn-sm"><i className="fa-solid fa-thumbtack" /> {p.pinned ? 'Unpin' : 'Pin'}</button>
                </form>
                <form action={deletePost}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="btn btn-ghost btn-sm" style={{ color: '#ef5a5a' }} aria-label="Delete"><i className="fa-solid fa-trash" /></button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
