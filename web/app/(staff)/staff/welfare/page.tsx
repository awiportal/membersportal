import { createClient } from '@/lib/supabase/server';
import { KES } from '@/lib/format';
import { approveClaim, rejectClaim, markClaimPaid } from './actions';

export const dynamic = 'force-dynamic';

function Badge({ s }: { s?: string }) {
  const cls =
    s === 'approved' || s === 'paid' ? 'badge-good' : s === 'rejected' ? 'badge-bad' : 'badge-warn';
  const label = s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default async function StaffWelfarePage() {
  const supabase = createClient();

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
  const decided = claims.filter((c) => c.status !== 'pending');

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
            {c.amount ? ` · ${KES(Number(c.amount))}` : ''}
          </div>
        </div>
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
        {c.status === 'approved' && (
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

      <div className="card card-pad" style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>
          Pending <span className="muted">({pending.length})</span>
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

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>
          Processed <span className="muted">({decided.length})</span>
        </div>
        {decided.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Nothing processed yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {decided.map((c) => (
              <ClaimCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
