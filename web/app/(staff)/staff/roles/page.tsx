import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isStaff, isAdmin, displayRole } from '@/lib/roles';
import { setRole } from './actions';
import InvestorRoleTable from './InvestorRoleTable';

export const dynamic = 'force-dynamic';

// Role labels shown in the change-role dropdown (value = member_role enum).
const ROLE_OPTIONS = [
  { value: 'member', label: 'Investor' },
  { value: 'secretary', label: 'Secretary' },
  { value: 'admin', label: 'Admin' },
  { value: 'superadmin', label: 'Chairlady' },
];

function RoleSelect({ id, role, self }: { id: string; role: string; self: boolean }) {
  return (
    <form action={setRole} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <input type="hidden" name="member_id" value={id} />
      <select
        name="role"
        defaultValue={role || 'member'}
        className="input"
        style={{ width: 'auto', fontSize: 12.5, padding: '7px 12px' }}
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button className="btn btn-ghost btn-sm" type="submit" title={self ? 'Change your own role' : 'Save role'}>
        Save
      </button>
    </form>
  );
}

// Role management — promote or demote members. Any staff can READ the roster,
// but the DB trigger guard_profile_role_change() blocks a role change unless the
// caller is_admin(), so this whole screen is Admin / Chairlady only.
export default async function StaffRolesPage({ searchParams }: { searchParams: { updated?: string; denied?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('id, role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');

  if (!isAdmin(me?.role)) {
    return (
      <div>
        <div className="page-title">Role management</div>
        <div className="sub">
          This area is restricted to Admin and the Chairlady. Your role can review members but cannot change roles.
        </div>
      </div>
    );
  }

  const { data: profs } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true });
  const people = (profs ?? []) as any[];
  const staff = people.filter((p) => p.role && p.role !== 'member');
  const members = people.filter((p) => !p.role || p.role === 'member');

  return (
    <div>
      <div className="page-title">Role management</div>
      <div className="sub">
        Promote a trusted member to Secretary or Admin, or adjust roles. Enforced at the database level.{' '}
        <span className="badge badge-good">Live</span> Admin / Chairlady only.
      </div>

      {searchParams?.updated && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <i className="fa-solid fa-circle-check" style={{ color: 'var(--lime2)' }} /> Role updated.
        </div>
      )}
      {searchParams?.denied && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--warn, #f2b23b)' }} /> That role change was blocked. Only an Admin or the Chairlady can change roles.
        </div>
      )}

      <div className="card card-pad" style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Current staff ({staff.length})</div>
        {staff.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No staff yet — promote a member below.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                  <th scope="col" style={{ padding: '8px 10px' }}>Name</th>
                  <th scope="col" style={{ padding: '8px 10px' }}>ID</th>
                  <th scope="col" style={{ padding: '8px 10px' }}>Role</th>
                  <th scope="col" style={{ padding: '8px 10px', textAlign: 'right' }}>Change role</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 10px', fontWeight: 600 }}>
                      {p.full_name || p.email || '—'}
                      {p.id === me?.id ? <span className="badge badge-info" style={{ marginLeft: 8, fontSize: 10.5 }}>You</span> : null}
                    </td>
                    <td style={{ padding: '9px 10px' }} className="num muted">{p.investor_id || '—'}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span className="badge badge-purple">{displayRole(p.role, p.title)}</span>
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                      <RoleSelect id={p.id} role={p.role} self={p.id === me?.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InvestorRoleTable members={members} />
    </div>
  );
}
