import { createClient } from '@/lib/supabase/server';
import { KES } from '@/lib/format';
import { enrollWelfare, fileClaim } from './actions';
import MoneyNav from '@/components/MoneyNav';

export const dynamic = 'force-dynamic';

function ClaimBadge({ s }: { s?: string }) {
  const cls = s === 'approved' || s === 'paid' ? 'badge-good' : s === 'rejected' ? 'badge-bad' : 'badge-warn';
  const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : '\u2014';
  return <span className={`badge ${cls}`}>{label}</span>;
}

const BENEFITS = [
  { icon: 'fa-dove', title: 'Bereavement', desc: 'Support for members and their families in times of loss.' },
  { icon: 'fa-notes-medical', title: 'Medical', desc: 'A helping hand with unexpected medical costs.' },
  { icon: 'fa-graduation-cap', title: 'Education', desc: 'Assistance towards school fees and education needs.' },
  { icon: 'fa-hands-holding-circle', title: 'Other support', desc: 'Discretionary help the committee may extend to members.' },
];

const STEPS = [
  'File a claim with the type and amount',
  'The AWIVEST committee reviews it',
  'You are updated here and paid if approved',
];

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

  const approved = claims.filter((c) => c.status === 'approved' || c.status === 'paid').length;
  const pending = claims.filter((c) => c.status === 'pending' || c.status === 'filed' || c.status === 'under_review').length;

  return (
    <div>
      <MoneyNav />

      <section className="hero rise">
        <div className="hero-grid">
          <div>
            <div className="hero-eyebrow">
              AWIVEST Welfare
              <span className={`badge ${enrolled ? 'badge-good' : 'badge-warn'}`} style={{ marginLeft: 10 }}>{enrolled ? 'Enrolled' : 'Not enrolled'}</span>
            </div>
            <div className="hero-value" style={{ fontSize: 34 }}>{enrolled ? "You're covered" : 'Protect your family'}</div>
            <div className="hero-line">
              {enrolled
                ? `The welfare scheme stands with you and your family through bereavement, medical and education needs${since ? '. A member since ' + since : ''}.`
                : 'Join the AWIVEST welfare scheme to become eligible for bereavement, medical and education support when it matters most.'}
            </div>
            {enrolled ? (
              <div className="hero-pills">
                <div className="hero-pill"><div className="k">Status</div><div className="v">Active</div></div>
                <div className="hero-pill"><div className="k">Claims filed</div><div className="v num">{claims.length}</div></div>
                <div className="hero-pill"><div className="k">Approved</div><div className="v num">{approved}</div></div>
              </div>
            ) : (
              <form action={enrollWelfare}>
                <button className="hero-cta" type="submit" style={{ border: 0, cursor: 'pointer' }}><i className="fa-solid fa-hand-holding-heart" /> Enroll now</button>
              </form>
            )}
          </div>
          <div className="hero-spark">
            <div className="hero-spark-lbl">How claims work</div>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              {STEPS.map((t, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ width: 22, height: 22, borderRadius: 999, background: 'rgba(166,205,53,0.25)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>{i + 1}</span>
                  <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.86)', lineHeight: 1.4 }}>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <div className="section-head rise-2" style={{ margin: '20px 0 14px' }}>
        <div>
          <div className="section-title">What the scheme covers</div>
          <div className="section-sub">Support AWIVEST members can call on.</div>
        </div>
      </div>
      <div className="insightgrid rise-2">
        {BENEFITS.map((b) => (
          <div key={b.title} className="insight">
            <span className="ic-round"><i className={`fa-solid ${b.icon}`} /></span>
            <div>
              <div className="insight-t">{b.title}</div>
              <div className="insight-d">{b.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="split rise-3" style={{ marginTop: 16 }}>
        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 12 }}>File a claim</div>
          {!enrolled && (
            <div className="insight" style={{ marginBottom: 14 }}>
              <span className="ic-round"><i className="fa-solid fa-lock" /></span>
              <div><div className="insight-t" style={{ fontSize: 13.5 }}>Enroll first</div><div className="insight-d">Join the scheme above to become eligible to file a claim.</div></div>
            </div>
          )}
          <form action={fileClaim}>
            <div className="field">
              <label>Claim type</label>
              <select className="input" name="claim_type" defaultValue="Bereavement" disabled={!enrolled}>
                <option>Bereavement</option>
                <option>Medical</option>
                <option>Education</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field">
              <label>Amount requested (KES, optional)</label>
              <input className="input" name="amount" placeholder="e.g. 50000" disabled={!enrolled} />
            </div>
            <button className="btn btn-lime" style={{ width: '100%', justifyContent: 'center' }} type="submit" disabled={!enrolled}>
              <i className="fa-solid fa-paper-plane" /> Submit claim
            </button>
          </form>
        </div>

        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 12 }}>Your enrollment</div>
          {enrolled ? (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="stat-ic grad-lime" style={{ color: '#20260a', width: 40, height: 40 }}><i className="fa-solid fa-shield-heart" /></span>
                <div>
                  <div style={{ fontWeight: 700 }}>Active cover</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{since ? 'Member since ' + since : 'Enrolled'}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
                <div className="stat"><div className="stat-lbl">Claims filed</div><div className="stat-val num">{claims.length}</div></div>
                <div className="stat"><div className="stat-lbl">Approved / paid</div><div className="stat-val num">{approved}</div></div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <span className="badge badge-warn" style={{ width: 'fit-content' }}>Not enrolled</span>
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>You are not currently enrolled. Enrolling is free and makes you eligible for welfare support.</div>
              <form action={enrollWelfare}>
                <button className="btn btn-lime btn-sm" type="submit"><i className="fa-solid fa-hand-holding-heart" /> Enroll now</button>
              </form>
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad rise-3" style={{ marginTop: 16 }}>
        <div className="section-head">
          <div>
            <div className="section-title">Your claims</div>
            <div className="section-sub">{claims.length > 0 ? `${claims.length} claim${claims.length === 1 ? '' : 's'} on record${pending > 0 ? ', ' + pending + ' pending' : ''}.` : 'Claims you file will appear here.'}</div>
          </div>
        </div>
        {claims.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No claims filed yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {claims.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 13, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <span className="stat-ic" style={{ background: 'var(--surface)', color: 'var(--lime2)', flex: '0 0 auto', width: 38, height: 38 }}><i className="fa-solid fa-hand-holding-heart" /></span>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600 }}>{c.claim_type}</div>
                  <div className="muted" style={{ fontSize: 12 }}>Filed {c.filed_at ? new Date(c.filed_at).toLocaleDateString('en-GB') : ''}{c.amount ? ' \u00b7 ' + KES(Number(c.amount)) : ''}</div>
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
