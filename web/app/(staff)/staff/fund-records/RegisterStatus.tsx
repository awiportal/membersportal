'use client';

import { useMemo, useState } from 'react';

// Rows arrive with National ID / phone ALREADY masked on the server — raw PII is
// never serialised to the browser. Search matches only reg. no. and name.
type Row = { member_no: string; full_name: string; nationalId: string; phone: string; linked: boolean };

export default function RegisterStatus({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState('');
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);

  const unlinkedCount = useMemo(() => rows.filter((r) => !r.linked).length, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (unlinkedOnly && r.linked) return false;
      if (!term) return true;
      return `${r.member_no} ${r.full_name}`.toLowerCase().includes(term);
    });
  }, [rows, q, unlinkedOnly]);

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Register status</div>
        <span className="badge badge-purple">{filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ''}</span>
        <button
          type="button"
          className={'btn btn-sm ' + (unlinkedOnly ? 'btn-lime' : 'btn-ghost')}
          onClick={() => setUnlinkedOnly((v) => !v)}
          aria-pressed={unlinkedOnly}
          disabled={unlinkedCount === 0 && !unlinkedOnly}
          title="Show only records not yet linked to a login"
        >
          <i className="fa-solid fa-link-slash" /> Unlinked{unlinkedCount ? ` (${unlinkedCount})` : ''}
        </button>
        <label className="search" style={{ marginLeft: 'auto', maxWidth: 260, flex: '1 1 180px' }}>
          <i className="fa-solid fa-magnifying-glass" />
          <input
            placeholder="Search reg. no. or name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search register"
            style={{ background: 'transparent', border: 0, outline: 'none', color: 'inherit', width: '100%', fontFamily: 'inherit', fontSize: 13 }}
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No fund records loaded yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr className="muted" style={{ textAlign: 'left', fontSize: 11.5 }}>
                <th scope="col" style={{ padding: '8px 10px' }}>Reg. no.</th>
                <th scope="col" style={{ padding: '8px 10px' }}>Name</th>
                <th scope="col" style={{ padding: '8px 10px' }}>National ID</th>
                <th scope="col" style={{ padding: '8px 10px' }}>Phone</th>
                <th scope="col" style={{ padding: '8px 10px' }}>Link</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.member_no} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 10px' }} className="num">{r.member_no}</td>
                  <td style={{ padding: '9px 10px', fontWeight: 600 }}>{r.full_name}</td>
                  <td style={{ padding: '9px 10px' }} className="num">{r.nationalId}</td>
                  <td style={{ padding: '9px 10px' }} className="num">{r.phone}</td>
                  <td style={{ padding: '9px 10px' }}>
                    {r.linked ? (
                      <span className="badge badge-good" style={{ fontSize: 10.5 }}><i className="fa-solid fa-link" /> Linked</span>
                    ) : (
                      <span className="badge badge-warn" style={{ fontSize: 10.5 }}>Unlinked</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ padding: '14px 10px', fontSize: 13 }}>No records match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
