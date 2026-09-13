import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { isAdmin, canViewStaffConsole } from '@/lib/roles';
import { PASSWORD_MIN_LENGTH } from '@/lib/password';

export const dynamic = 'force-dynamic';

// Security hardening dashboard (#160). Surfaces the three plan items in-app:
//   - Password policy (enforced in code; shown here for confirmation).
//   - Backups & recovery (a Supabase platform setting — a verify checklist).
//   - RLS audit (live, table-by-table, via the rls_audit() SECURITY DEFINER fn).
// Admin / Chairlady only, matching Role management. The RLS audit reads through
// the service-role admin client, so the page gate is the security boundary.

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--border)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted2)' };
const thr: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 };
const tdr: React.CSSProperties = { ...td, textAlign: 'right' };

export default async function StaffSecurityPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const role = me?.role as string | undefined;
  if (!canViewStaffConsole(role)) redirect('/dashboard');
  const admin = isAdmin(role);

  let rls: any[] = [];
  let rlsError: string | null = null;
  if (admin) {
    try {
      const a = createAdminClient();
      const { data, error } = await a.rpc('rls_audit');
      if (error) rlsError = error.message;
      else rls = (data ?? []) as any[];
    } catch (e: any) {
      rlsError = e?.message || 'Failed to run the RLS audit.';
    }
  }

  const flagged = rls.filter((r) => !r.rls_enabled || Number(r.policy_count || 0) === 0);
  const withRls = rls.filter((r) => r.rls_enabled).length;
  // Show flagged tables first, then the rest, each alphabetical.
  const ordered = [
    ...flagged,
    ...rls.filter((r) => !(flagged.includes(r))),
  ];

  return (
    <div style={{ maxWidth: 940, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">Security</div>
        <div className="sub">Security-hardening status: password policy, backups, and a live row-level-security audit.</div>
      </div>

      {!admin ? (
        <div className="card card-pad muted" style={{ fontSize: 13 }}>
          The security dashboard is available to an Admin or the Chairlady.
        </div>
      ) : (
        <>
          {/* Password policy */}
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}><i className="fa-solid fa-key" style={{ marginRight: 8, opacity: 0.7 }} />Password policy</div>
              <span className="badge badge-good"><i className="fa-solid fa-circle-check" /> Enforced</span>
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
              New passwords must be at least {PASSWORD_MIN_LENGTH} characters and include an upper-case letter, a lower-case letter, and a digit. Enforced at sign-up (and any password change) through the shared <span className="num">validatePassword()</span> helper. Existing logins are unaffected until they next change their password.
            </div>
          </div>

          {/* Backups & recovery */}
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}><i className="fa-solid fa-database" style={{ marginRight: 8, opacity: 0.7 }} />Backups &amp; recovery</div>
              <span className="badge badge-warn"><i className="fa-solid fa-triangle-exclamation" /> Verify in Supabase</span>
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
              Backups are a Supabase platform setting, not something the app can enable or confirm on its own. Verify in the Supabase dashboard under <strong>Project &rarr; Database &rarr; Backups</strong>:
            </div>
            <ul className="muted" style={{ fontSize: 12.5, marginTop: 8, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>Daily scheduled backups are enabled and recent.</li>
              <li>Point-in-time recovery (PITR) is turned on (requires the Pro plan).</li>
              <li>A test restore has been performed at least once and documented.</li>
            </ul>
          </div>

          {/* RLS audit */}
          <div className="card card-pad">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}><i className="fa-solid fa-table-cells-large" style={{ marginRight: 8, opacity: 0.7 }} />Row-level security audit</div>
              {rlsError ? (
                <span className="badge badge-bad"><i className="fa-solid fa-circle-xmark" /> Unavailable</span>
              ) : flagged.length ? (
                <span className="badge badge-bad"><i className="fa-solid fa-triangle-exclamation" /> {flagged.length} to review</span>
              ) : (
                <span className="badge badge-good"><i className="fa-solid fa-circle-check" /> All tables protected</span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12.5, margin: '8px 0 12px' }}>
              Every base table in the <span className="num">public</span> schema, whether row-level security is enabled, and how many policies it has. Tables with RLS off or zero policies are flagged for review.
            </div>

            {rlsError ? (
              <div className="muted" style={{ fontSize: 12.5 }}>
                Could not run the audit: {rlsError}. If this mentions a missing function, apply migration <span className="num">20260913050000_rls_audit_function.sql</span> and reload.
              </div>
            ) : rls.length === 0 ? (
              <div className="muted" style={{ fontSize: 12.5 }}>No tables returned.</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
                  <span className="muted">Tables <strong className="num" style={{ color: 'var(--text)' }}>{rls.length}</strong></span>
                  <span className="muted">RLS enabled <strong className="num" style={{ color: 'var(--text)' }}>{withRls}</strong></span>
                  <span className="muted">Flagged <strong className="num" style={{ color: flagged.length ? 'var(--bad)' : 'var(--text)' }}>{flagged.length}</strong></span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={th}>Table</th>
                      <th style={th}>RLS</th>
                      <th style={thr}>Policies</th>
                      <th style={th}>Status</th>
                    </tr></thead>
                    <tbody>
                      {ordered.map((r) => {
                        const isFlagged = !r.rls_enabled || Number(r.policy_count || 0) === 0;
                        return (
                          <tr key={r.table_name}>
                            <td style={td} className="num">{r.table_name}</td>
                            <td style={td}>
                              {r.rls_enabled
                                ? <span className="badge badge-good" style={{ fontSize: 10.5 }}>On{r.force_rls ? ' (forced)' : ''}</span>
                                : <span className="badge badge-bad" style={{ fontSize: 10.5 }}>Off</span>}
                            </td>
                            <td style={tdr} className="num">{Number(r.policy_count || 0)}</td>
                            <td style={td}>
                              {isFlagged
                                ? <span className="badge badge-bad" style={{ fontSize: 10.5 }}>Review</span>
                                : <span className="badge badge-good" style={{ fontSize: 10.5 }}>OK</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
