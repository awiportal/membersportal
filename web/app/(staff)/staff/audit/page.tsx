import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { isAdmin, canViewStaffConsole, isAuditor } from '@/lib/roles';

export const dynamic = 'force-dynamic';

function fmtWhen(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtMeta(meta: any): string {
  if (meta == null) return '';
  if (typeof meta === 'string') return meta;
  try {
    return Object.entries(meta)
      .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
      .join('  ·  ');
  } catch {
    try {
      return JSON.stringify(meta);
    } catch {
      return '';
    }
  }
}

// Read-only audit trail. Any staff can read audit_log at the RLS layer, but the
// trail exposes system-wide governance data, so this screen is Admin / Chairlady
// only — matching Role management. Rows are written by server actions and RPCs
// (e.g. membership_linked); nothing is mutated here.
export default async function StaffAuditPage({
  searchParams,
}: {
  searchParams: { action?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('id, role').eq('id', user.id).single();
  if (!canViewStaffConsole(me?.role)) redirect('/staff');

  if (!isAdmin(me?.role) && !isAuditor(me?.role)) {
    return (
      <div>
        <div className="page-title">Audit log</div>
        <div className="sub">
          This area is restricted to Admin and the Chairlady. Your role can operate the console but cannot view the
          full audit trail.
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: rowsRaw } = await admin
    .from('audit_log')
    .select('id, actor_id, member_id, action, meta, created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  const rows = (rowsRaw ?? []) as any[];

  const ids = Array.from(new Set(rows.flatMap((r) => [r.actor_id, r.member_id]).filter(Boolean))) as string[];
  const { data: profsRaw } = ids.length
    ? await admin.from('profiles').select('id, full_name, email, investor_id').in('id', ids)
    : { data: [] as any[] };
  const nameById = new Map(
    ((profsRaw ?? []) as any[]).map((p) => [p.id, p.full_name || p.email || p.investor_id || '—'])
  );

  const actions = Array.from(new Set(rows.map((r) => r.action).filter(Boolean))).sort() as string[];
  const active = searchParams?.action || '';
  const view = active ? rows.filter((r) => r.action === active) : rows;

  return (
    <div>
      <div className="page-title">Audit log</div>
      <div className="sub">
        Every recorded action across the system — who did what, and when.{' '}
        <span className="badge badge-good">Live</span> Admin / Chairlady only.
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        <a href="/staff/audit" className={`btn btn-sm ${active ? 'btn-ghost' : ''}`}>
          All
        </a>
        {actions.map((a) => (
          <a
            key={a}
            href={`/staff/audit?action=${encodeURIComponent(a)}`}
            className={`btn btn-sm ${active === a ? '' : 'btn-ghost'}`}
          >
            {a}
          </a>
        ))}
      </div>

      <div className="card card-pad" style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>
          {active ? `${active} ` : ''}Events ({view.length}
          {rows.length >= 300 ? ', latest 300' : ''})
        </div>
        {view.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>
            No audit events recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                  <th scope="col" style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    When
                  </th>
                  <th scope="col" style={{ padding: '8px 10px' }}>
                    Action
                  </th>
                  <th scope="col" style={{ padding: '8px 10px' }}>
                    Actor
                  </th>
                  <th scope="col" style={{ padding: '8px 10px' }}>
                    Member
                  </th>
                  <th scope="col" style={{ padding: '8px 10px' }}>
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                    <td className="num muted" style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                      {fmtWhen(r.created_at)}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <span className="badge badge-info">{r.action}</span>
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      {r.actor_id ? nameById.get(r.actor_id) || '—' : <span className="muted">system</span>}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      {r.member_id ? nameById.get(r.member_id) || '—' : <span className="muted">—</span>}
                    </td>
                    <td className="muted" style={{ padding: '9px 10px', fontSize: 12.5, wordBreak: 'break-word' }}>
                      {fmtMeta(r.meta)}
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
