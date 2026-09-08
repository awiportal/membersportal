import { createClient } from '@/lib/supabase/server';
import { KES } from '@/lib/format';
import { enrollWelfare, fileClaim } from './actions';

export const dynamic = 'force-dynamic';

function ClaimBadge({ s }: { s?: string }) {
  const cls = s === 'approved' || s === 'paid' ? 'badge-good' : s === 'rejected' ? 'badge-bad' : 'badge-warn';
  const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default async function WelfarePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  const [{ data: enrollRows }, { data: claimRows }] = await Promise.all([
    supabase.from('welfare_enrollments').select('*').eq('member_id', uid).limit(1),
    supabase.from('welfare_claims').select('*').eq('member_id', uid).order('filed_at', { ascending: false }),
  ]);
  const enrollment = ((enrollRows ?? []) as any[])[0];
  const claims = (claimRows ?? []) as any[];
  const enrolled = enrollment && enrollment.status === 'active';
  const since = enrollment?.enrolled_at
    ? new Date(enrollment.enrolled_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : null;

  return (
    <div>
      <div className="page-title">Welfare</div>
      <div className="sub">Enroll in the welfare scheme, file claims, and track their status.</div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', marginTop: 20 }}>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Your enrollment</div>
          {enrolled ? (
            <>
              <span className="badge badge-good">Enrolled</span>
              <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>{since ? `Member since ${since}.` : 'Active.'}</div>
            </>
          ) : (
            <>
              <span className="badge badge-warn">Not enrolled</span>
              <div className="muted" style={{ fontSize: 13, margin: '10px 0 12px' }}>Join the AWIVEST welfare scheme to become eligible to file claims.</div>
              <form action={enrollWelfare}>
                <button className="btn btn-lime btn-sm" type="submit"><i className="fa-solid fa-hand-holding-heart" /> Enroll now</button>
              </form>
            </>
          )}
        </div>

        <div className="card card-pad">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>File a claim</div>
          <form action={fileClaim}>
            <div className="field">
              <label>Claim type</label>
              <select className="input" name="claim_type" defaultValue="Bereavement">
                <option>Bereavement</option>
                <option>Medical</option>
                <option>Education</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field">
              <label>Amount requested (KES, optional)</label>
              <input className="input" name="amount" placeholder="e.g. 50000" />
            </div>
            <button className="btn btn-lime" style={{ width: '100%', justifyContent: 'center' }} type="submit" disabled={!enrolled}>
              Submit claim
            </button>
            {!enrolled && <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Enroll first to file a claim.</div>}
          </form>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Your claims</div>
        {claims.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No claims filed yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {claims.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600 }}>{c.claim_type}</div>
                  <div className="muted" style={{ fontSize: 12 }}>Filed {c.filed_at ? new Date(c.filed_at).toLocaleDateString('en-GB') : ''}{c.amount ? ` · ${KES(Number(c.amount))}` : ''}</div>
                </div>
                <ClaimBadge s={c.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
