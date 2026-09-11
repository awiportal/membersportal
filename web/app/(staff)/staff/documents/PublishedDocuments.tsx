'use client';

import { useMemo, useState } from 'react';
import { deleteDocument } from './actions';
import ConfirmSubmit from '@/components/ConfirmSubmit';

type Doc = {
  id: string;
  title: string;
  type: string;
  member_id: string | null;
  memberLabel: string | null;
  created_at: string | null;
};

const TYPE_ICON: Record<string, string> = {
  statement: 'fa-file-invoice-dollar',
  report: 'fa-chart-column',
  certificate: 'fa-certificate',
  welfare_statement: 'fa-hand-holding-heart',
  guide: 'fa-book-open',
  policy: 'fa-file-shield',
  onboarding: 'fa-user-plus',
  other: 'fa-folder-open',
};

// Pin the timezone so the server and client render the same date string and we
// don't trip a hydration mismatch near midnight.
const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' })
    : null;

export default function PublishedDocuments({ docs }: { docs: Doc[] }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');

  const types = useMemo(
    () => Array.from(new Set(docs.map((d) => d.type).filter(Boolean))).sort(),
    [docs]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (type !== 'all' && d.type !== type) return false;
      if (!term) return true;
      return `${d.title} ${d.memberLabel || ''} ${d.type}`.toLowerCase().includes(term);
    });
  }, [docs, q, type]);

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Published documents</div>
        <span className="badge badge-purple">{filtered.length}{filtered.length !== docs.length ? ` of ${docs.length}` : ''}</span>
        {types.length > 1 && (
          <select
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Filter by type"
            style={{ width: 'auto', padding: '8px 34px 8px 12px', fontSize: 13 }}
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <label className="search" style={{ marginLeft: 'auto', maxWidth: 260, flex: '1 1 180px' }}>
          <i className="fa-solid fa-magnifying-glass" />
          <input
            placeholder="Search documents…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search documents"
            style={{ background: 'transparent', border: 0, outline: 'none', color: 'inherit', width: '100%', fontFamily: 'inherit', fontSize: 13 }}
          />
        </label>
      </div>

      {docs.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No documents yet. Upload your first one above.</div>
      ) : filtered.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No documents match your search.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((d) => (
            <div
              key={d.id}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)', flexWrap: 'wrap' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: 'var(--purple2)' }}>
                <i className={`fa-solid ${TYPE_ICON[d.type] || 'fa-folder-open'}`} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600 }}>{d.title}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="badge badge-info" style={{ fontSize: 11 }}>{d.type}</span>
                  <span className={`badge ${d.member_id ? 'badge-purple' : 'badge-good'}`} style={{ fontSize: 11 }}>
                    {d.member_id ? `For ${d.memberLabel}` : 'All members'}
                  </span>
                  {fmtDate(d.created_at) && (
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      <i className="fa-regular fa-calendar" /> Published {fmtDate(d.created_at)}
                    </span>
                  )}
                </div>
              </div>
              <form action={deleteDocument}>
                <input type="hidden" name="id" value={d.id} />
                <ConfirmSubmit
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#ff8a8a' }}
                  ariaLabel="Delete document"
                  title="Delete this document?"
                  body="This permanently removes the document and its file for members. This can’t be undone."
                  confirmLabel="Delete document"
                >
                  <i className="fa-solid fa-trash" />
                </ConfirmSubmit>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
