import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { roleLabel, statusLabel } from '@/lib/roles';
import { approveMember } from './actions';

export const dynamic = 'force-dynamic';

function StatusBadge({ s }: { s?: string }) {
  const cls =
    s === 'active' ? 'badge-good' : s === 'pending' ? 'badge-warn' : s === 'archived' ? 'badge-purple' : 'badge-bad';
  return <span className={`badge ${cls}`}>{statusLabel(s)}</span>;
}

export default async function StaffHome() {
  const supabase = createClient();
  const { data: members } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  const all = (members ?? []) as any[];

  const pendingQueue = all.filter((m) => m.status === 'pending' && m.onboarding_step === 'submitted');
  const activeCount = all.filter((m) => m.status === 'active').length;
  const pendingCount = all.filter((m) => m.status === 'pending').length;
  const total = all.length;

  const kpis = [
    { label: 'Awaiting approval', value: pendingQueue.length, icon: 'fa-user-clock', accent: true },
    { label: 'Active members', value: activeCount, icon: 'fa-user-check' },
    { label: 'Pending members', value: pendingCount, icon: 'fa-hourglass-half' },
    { label: 'Total members', value: total, icon: 'fa-users' },
  ];

  return (
    <div>
      <div className="page-title">Approvals &amp; Members</div>
      <div className="sub">Review submitted membership packs, approve members, and manage the register.</div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', margin: '22px 0 20px' }}>
        {kpis.map((k) => (
          <div key={k.label} className="card kpi hover-lift">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="lbl">{k.label}</span>
              <span className={`ic ${k.accent ? 'grad-lime' : ''}`} style={{ background: k.accent ? undefined : 'var(--surface2)', color: k.accent ? '#20260a' : 'var(--lime2)' }}>
                <i className={`fa-solid ${k.icon}`} />
              </span>
            </div>
            <div className="val num">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Approval queue */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Awaiting approval</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Members who submitted a complete pack for committee approval.</div>
        {pendingQueue.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No packs waiting. You&apos;re all caught up.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingQueue.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, borderRadius: 13, background: 'var(--surface2)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600 }}>{m.full_name || m.email || 'Member'}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {m.investor_id || '—'} · {m.email}
                    {m.submitted_at ? ` · submitted ${new Date(m.submitted_at).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <Link href={`/staff/members/${m.id}`} className="btn btn-ghost btn-sm">Review pack</Link>
                <form action={approveMember}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className="btn btn-lime btn-sm" type="submit"><i className="fa-solid fa-check" /> Approve</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All members */}
      <div className="card card-pad">
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>All members</div>
        {all.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No members yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                  <th style={{ padding: '8px 10px' }}>Name</th>
                  <th style={{ padding: '8px 10px' }}>Investor ID</th>
                  <th style={{ padding: '8px 10px' }}>Role</th>
                  <th style={{ padding: '8px 10px' }}>Status</th>
                  <th style={{ padding: '8px 10px' }} />
                </tr>
              </thead>
              <tbody>
                {all.map((m) => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px' }}>
                      <div style={{ fontWeight: 600 }}>{m.full_name || '—'}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{m.email}</div>
                    </td>
                    <td style={{ padding: '10px' }} className="num">{m.investor_id || '—'}</td>
                    <td style={{ padding: '10px' }}>{roleLabel(m.role)}</td>
                    <td style={{ padding: '10px' }}><StatusBadge s={m.status} /></td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      <Link href={`/staff/members/${m.id}`} className="btn btn-ghost btn-sm">Open</Link>
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
