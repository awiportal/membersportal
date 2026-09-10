'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import StatementBody from './StatementBody';

const kes = (v: any) => (v == null || isNaN(Number(v)) ? '—' : 'KES ' + Math.round(Number(v)).toLocaleString('en-KE'));

export default function StaffStatementsBrowser({ rows }: { rows: any[] }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<any | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => (String(r.member_no) + ' ' + String(r.full_name)).toLowerCase().includes(s));
  }, [q, rows]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const total = rows.length;
  const linked = rows.filter((r) => r.member_id).length;
  const exiting = rows.filter((r) => r.status === 'exiting').length;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="page-title">Member statements</div>
      <div className="sub">Open any member&apos;s full statement — opening balance, contributions, interest breakdown, withdrawals and total — in a side panel to review or resolve a query.</div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', margin: '22px 0 18px' }}>
        <div className="card kpi hover-lift"><span className="lbl">Members</span><div className="val">{total}</div></div>
        <div className="card kpi hover-lift"><span className="lbl">Linked to a login</span><div className="val">{linked}/{total}</div></div>
        <div className="card kpi hover-lift"><span className="lbl">Exiting</span><div className="val">{exiting}</div></div>
      </div>

      <div className="card card-pad">
        <div className="input-group" style={{ marginBottom: 14 }}>
          <i className="fa-solid fa-magnifying-glass" />
          <input className="input" placeholder="Search by name or member number" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 38 }} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr className="muted" style={{ textAlign: 'left', fontSize: 11.5 }}>
                <th style={{ padding: '8px 10px' }}>Reg. no.</th>
                <th style={{ padding: '8px 10px' }}>Name</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Current balance</th>
                <th style={{ padding: '8px 10px' }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.member_no} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setSel(r)}>
                  <td style={{ padding: '9px 10px' }} className="num">{r.member_no}</td>
                  <td style={{ padding: '9px 10px', fontWeight: 600 }}>{r.full_name}</td>
                  <td style={{ padding: '9px 10px' }}>
                    <span className={'badge ' + (r.status === 'active' ? 'badge-good' : r.status === 'exiting' ? 'badge-warn' : 'badge-info')} style={{ fontSize: 10.5 }}>{r.status || 'member'}</span>
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600 }} className="num">{kes(r.current_balance)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setSel(r); }}><i className="fa-solid fa-eye" /> View</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="muted" style={{ padding: '14px 10px', fontSize: 13 }}>No members match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {sel && (
        <>
          <div className="drawer-scrim" onClick={() => setSel(null)} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label={'Statement for ' + String(sel.full_name)}>
            <div className="drawer-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{sel.full_name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{sel.member_no} · statement</div>
              </div>
              <button className="icon-btn" type="button" onClick={() => setSel(null)} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
            </div>
            <div className="drawer-body">
              <StatementBody fin={sel} />
            </div>
            <div className="drawer-foot">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setSel(null)}>Close</button>
              <Link href={'/staff/statements/' + encodeURIComponent(sel.member_no)} className="btn btn-lime btn-sm"><i className="fa-solid fa-up-right-from-square" /> Open full &amp; print</Link>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
