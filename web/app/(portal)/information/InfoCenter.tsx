'use client';
import { useMemo, useState } from 'react';

const CATS = [
  { id: 'all', label: 'All', icon: 'fa-layer-group' },
  { id: 'announcement', label: 'Announcements', one: 'Announcement', icon: 'fa-bullhorn', cls: 'badge-purple' },
  { id: 'news', label: 'News', one: 'News', icon: 'fa-newspaper', cls: 'badge-info' },
  { id: 'event', label: 'Events', one: 'Event', icon: 'fa-calendar-day', cls: 'badge-lime' },
  { id: 'update', label: 'Updates', one: 'Update', icon: 'fa-arrows-rotate', cls: 'badge-good' },
];
const meta = (id: string) => CATS.find((c) => c.id === id) || CATS[1];

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const fmtDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

export default function InfoCenter({ posts }: { posts: any[] }) {
  const [cat, setCat] = useState('all');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: posts.length };
    for (const p of posts) c[p.category] = (c[p.category] || 0) + 1;
    return c;
  }, [posts]);

  const filtered = cat === 'all' ? posts : posts.filter((p) => p.category === cat);

  return (
    <div style={{ marginTop: 18 }}>
      {/* Category filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {CATS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCat(c.id)}
            className={`btn btn-sm ${cat === c.id ? 'btn-primary' : 'btn-ghost'}`}
          >
            <i className={`fa-solid ${c.icon}`} /> {c.label}
            {counts[c.id] ? ` (${counts[c.id]})` : ''}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card card-pad muted" style={{ fontSize: 13 }}>
          Nothing here yet. Check back soon for updates from the AWIVEST office.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
          {filtered.map((p) => {
            const m = meta(p.category);
            return (
              <article
                key={p.id}
                className="card card-pad hover-lift"
                style={{ display: 'flex', flexDirection: 'column', gap: 10, borderColor: p.pinned ? 'rgba(166,205,53,0.45)' : undefined }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`badge ${m.cls}`}><i className={`fa-solid ${m.icon}`} /> {m.one}</span>
                  {p.pinned && <span className="badge badge-lime"><i className="fa-solid fa-thumbtack" /> Pinned</span>}
                  <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{fmtDate(p.published_at || p.created_at)}</span>
                </div>

                <div style={{ fontWeight: 800, fontSize: 16.5, letterSpacing: '-.2px' }}>{p.title}</div>

                {p.category === 'event' && (p.event_at || p.event_location) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '10px 12px', borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12.5 }}>
                    {p.event_at && (
                      <div><i className="fa-solid fa-calendar-day" style={{ color: 'var(--lime2)', marginRight: 8 }} />{fmtDateTime(p.event_at)}</div>
                    )}
                    {p.event_location && (
                      <div><i className="fa-solid fa-location-dot" style={{ color: 'var(--lime2)', marginRight: 8 }} />{p.event_location}</div>
                    )}
                  </div>
                )}

                {p.body && (
                  <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{p.body}</div>
                )}

                {p.link_url && (
                  <a href={p.link_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', marginTop: 2 }}>
                    <i className="fa-solid fa-arrow-up-right-from-square" /> Learn more
                  </a>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
