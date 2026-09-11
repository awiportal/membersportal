import { createClient } from '@/lib/supabase/server';
import { KES } from '@/lib/format';
import { approveClaim, rejectClaim, markClaimPaid } from './actions';
import { canDisburseFunds } from '@/lib/roles';

export const dynamic = 'force-dynamic';

function Badge({ s }: { s?: string }) {
  const cls =
    s === 'approved' || s === 'paid' ? 'badge-good' : s === 'rejected' ? 'badge-bad' : 'badge-warn';
  const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
  return <span className={`badge ${cls}`}>{label}</span>;
}

const sumAmount = (rows: any[]) => rows.reduce((t, c) => t + Number(c.amount || 0), 0);

export default async function StaffWelfarePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).single()
    : { data: null as any };
  const canDisburse = canDisburseFunds(me?.role);

  const { data: claimRows } = await supabase
    .from('welfare_claims')
    .select('*')
    .order('filed_at', { ascending: false });
  const claims = (claimRows ?? []) as any[];

  const memberIds = Array.from(new Set(claims.map((c) => c.member_id).filter(Boolean)));
  let byId: Record<string, any> = {};
  if (memberIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, investor_id, email')
      .in('id', memberIds);
    byId = Object.fromEntries(((profs ?? []) as any[]).map((p) => [p.id, p]));
  }

  const pending = claims.filter((c) => c.status === 'pending');
  // Approved but not yet paid out — these still carry the "Mark paid" action and
  // used to be buried in the Processed list, so we surface them on their own.
  const awaiting = claims.filter((c) => c.status === 'approved');
  const paid = claims.filter((c) => c.status === 'paid');
  const rejected = claims.filter((c) => c.status === 'rejected');
  const processed = claims.filter((c) => c.status === 'paid' || c.status === 'rejected');

  const kpis: { label: string; value: string; sub: string; icon: string; accent?: boolean }[] = [
    { label: 'Pending review', value: String(pending.length), sub: pending.length ? 'Awaiting a decision' : 'All caught up', icon: 'fa-inbox', accent: pending.length > 0 },
    { label: 'Awaiting payment', value: String(awaiting.length), sub: awaiting.length ? `${KES(sumAmount(awaiting))} to pay` : 'Nothing to pay', icon: 'fa-money-bill-transfer', accent: awaiting.length > 0 },
    { label: 'Paid', value: String(paid.length), sub: `${KES(sumAmount(paid))} disbursed`, icon: 'fa-circle-check' },
    { label: 'Returned', value: String(rejected.length), sub: 'Not approved', icon: 'fa-rotate-left' },
  ];

  const ClaimCard = ({ c }: { c: any }) => {
    const m = byId[c.member_id] || {};
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          borderRadius: 12,
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600 }}>
            {m.full_name || m.email || 'Member'} · {c.claim_type}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {m.investor_id ? `${m.investor_id} · ` : ''}
            Filed {c.filed_at ? new Date(c.filed_at).toLocaleDateString('en-GB') : ''}
          </div>
        </div>
        <div className="num" style={{ fontWeight: 700, fontSize: 14 }}>{c.amount ? KES(Number(c.amount)) : '—'}</div>
        <Badge s={c.status} />
        {c.status === 'pending' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <form action={approveClaim}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn btn-lime btn-sm" type="submit">
                <i className="fa-solid fa-check" /> Approve
              </button>
            </form>
            <form action={rejectClaim}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn btn-ghost btn-sm" type="submit">
                <i className="fa-solid fa-xmark" /> Reject
              </button>
            </form>
          </div>
        )}
        {c.status === 'approved' && canDisburse && (
          <form action={markClaimPaid}>
            <input type="hidden" name="id" value={c.id} />
            <button className="btn btn-primary btn-sm" type="submit">
              <i className="fa-solid fa-money-bill-transfer" /> Mark paid
            </button>
          </form>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-title">Welfare claims</div>
      <div className="sub">Review member welfare claims, approve or return them, and mark funds paid.</div>

      {/* Summary of where every claim stands and how much money is committed */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', margin: '18px 0 4px' }}>
        {kpis.map((k) => (
          <div key={k.label} className="card kpi">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="lbl">{k.label}</span>
              <span
                className={`ic ${k.accent ? 'grad-lime' : ''}`}
                style={{ background: k.accent ? undefined : 'var(--surface2)', color: k.accent ? '#20260a' : 'var(--lime2)' }}
              >
                <i className={`fa-solid ${k.icon}`} />
              </span>
            </div>
            <div className="val num">{k.value}</div>
            <div style={{ fontSize: 11.5, marginTop: 4, fontWeight: 600, color: 'var(--muted)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Pending review */}
      <div className="card card-pad" style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>
          Pending review <span className="muted">({pending.length})</span>
        </div>
        {pending.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No claims awaiting review.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map((c) => (
              <ClaimCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>

      {/* Approved and waiting to be paid — the money-out queue */}
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>
            Awaiting payment <span className="muted">({awaiting.length})</span>
          </div>
          {awaiting.length > 0 && (
            <span className="badge badge-warn" style={{ marginLeft: 'auto' }}>{KES(sumAmount(awaiting))} to pay</span>
          )}
        </div>
        {awaiting.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No approved claims waiting to be paid.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {awaiting.map((c) => (
              <ClaimCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>

      {/* Processed history (paid or returned) */}
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>
          Processed <span className="muted">({processed.length})</span>
        </div>
        {processed.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Nothing processed yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {processed.map((c) => (
              <ClaimCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
