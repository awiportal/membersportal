'use client';

import { useMemo, useState } from 'react';
import { setRole } from './actions';

// Value = member_role enum; label = the AWIVEST-facing name.
const ROLE_OPTIONS = [
  { value: 'member', label: 'Investor' },
  { value: 'secretary', label: 'Secretary' },
  { value: 'admin', label: 'Admin' },
  { value: 'superadmin', label: 'Chairlady' },
];

type Person = { id: string; full_name: string | null; email: string | null; investor_id: string | null; role: string | null };

export default function InvestorRoleTable({ members }: { members: Person[] }) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return members;
    return members.filter((p) =>
      `${p.full_name || ''} ${p.email || ''} ${p.investor_id || ''}`.toLowerCase().includes(term)
    );
  }, [members, q]);

  return (
    <div className="card card-pad" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontWeight: 700 }}>
          All investors <span className="muted">({members.length})</span>
        </div>
        <label className="search" style={{ marginLeft: 'auto', maxWidth: 260, flex: '1 1 180px' }}>
          <i className="fa-solid fa-magnifying-glass" />
          <input
            placeholder="Search name, email or ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search investors"
            style={{ background: 'transparent', border: 0, outline: 'none', color: 'inherit', width: '100%', fontFamily: 'inherit', fontSize: 13 }}
          />
        </label>
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        Promote any investor to Secretary or Admin. Changes take effect immediately and are audited.
      </div>

      {members.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No investor accounts yet.</div>
      ) : filtered.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No investors match your search.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                <th scope="col" style={{ padding: '8px 10px' }}>Name</th>
                <th scope="col" style={{ padding: '8px 10px' }}>ID</th>
                <th scope="col" style={{ padding: '8px 10px', textAlign: 'right' }}>Assign role</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 10px', fontWeight: 600 }}>{p.full_name || p.email || '—'}</td>
                  <td style={{ padding: '9px 10px' }} className="num muted">{p.investor_id || '—'}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                    <form action={setRole} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <input type="hidden" name="member_id" value={p.id} />
                      <select name="role" defaultValue={p.role || 'member'} className="input" style={{ width: 'auto', fontSize: 12.5, padding: '7px 12px' }}>
                        {ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <button className="btn btn-ghost btn-sm" type="submit" title="Save role">Save</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
