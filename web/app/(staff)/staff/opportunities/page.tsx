import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isStaff } from '@/lib/roles';
import { KES } from '@/lib/format';
import { addOpportunity, removeOpportunity } from './actions';
import ConfirmSubmit from '@/components/ConfirmSubmit';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  open: 'badge-good',
  closed: 'badge-warn',
  funded: 'badge-info',
};

// Staff Opportunities management — publish investment opportunities to every
// member and see live expressions of interest. RLS: opp_staff lets is_staff()
// write; opp_int_owner lets is_staff() read every member's interest row, so the
// counts below are real (not per-member).
export default async function StaffOpportunitiesPage({
  searchParams,
}: {
  searchParams: { added?: string; removed?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/staff');

  const [{ data: oppData }, { data: interestData }] = await Promise.all([
    supabase.from('opportunities').select('*').order('closes_at', { ascending: true }),
    supabase.from('opportunity_interests').select('opportunity_id'),
  ]);
  const opps = (oppData ?? []) as any[];
  const interests = (interestData ?? []) as any[];
  const counts = new Map<string, number>();
  for (const i of interests) counts.set(i.opportunity_id, (counts.get(i.opportunity_id) || 0) + 1);
  const totalInterest = interests.length;

  const notice = searchParams?.added ? 'Opportunity published.' : searchParams?.removed ? 'Opportunity removed.' : '';

  return (
    <div>
      <div className="page-title">Opportunities</div>
      <div className="sub">
        Publish investment opportunities to every member. Members express interest from their portal.{' '}
        <span className="badge badge-good">Live</span>
      </div>

      {notice && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <i className="fa-solid fa-circle-check" style={{ color: 'var(--lime2)' }} /> {notice}
        </div>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', marginTop: 18 }}>
        <form action={addOpportunity} className="card card-pad">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Add an opportunity</div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Title</label>
            <input className="input" name="name" required placeholder="e.g. AWIVEST Land Banking — Kajiado" style={{ width: '100%' }} />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Asset class</label>
            <input className="input" name="asset_class" placeholder="e.g. Property, Money Market, Equities" style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', marginBottom: 10 }}>
            <div className="field">
              <label style={{ fontSize: 12.5, fontWeight: 600 }}>Indicative return</label>
              <input className="input" name="target_irr" placeholder="~11.8% p.a." style={{ width: '100%' }} />
            </div>
            <div className="field">
              <label style={{ fontSize: 12.5, fontWeight: 600 }}>Minimum (KES)</label>
              <input className="input" name="min_amount" inputMode="numeric" placeholder="5000" style={{ width: '100%' }} />
            </div>
            <div className="field">
              <label style={{ fontSize: 12.5, fontWeight: 600 }}>Closes</label>
              <input className="input" name="closes_at" type="date" style={{ width: '100%' }} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Description</label>
            <textarea className="input" name="description" rows={3} placeholder="Partner, risk notes, how the fund participates…" style={{ width: '100%' }} />
          </div>
          <button className="btn btn-lime" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
            <i className="fa-solid fa-plus" /> Publish opportunity
          </button>
        </form>

        <div className="card card-pad">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>How members see it</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Each open opportunity appears as a card on the member Opportunities page with an Express-interest button.
            Interest counts below update as members respond.
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <span className="muted">Published opportunities</span>
            <span className="num" style={{ fontWeight: 700 }}>{opps.length}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <span className="muted">Open right now</span>
            <span className="num" style={{ fontWeight: 700 }}>{opps.filter((o) => o.status === 'open').length}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <span className="muted">Total expressions of interest</span>
            <span className="num" style={{ fontWeight: 700 }}>{totalInterest}</span>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Published opportunities</div>
        {opps.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No opportunities yet — add one above.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}>
                  <th style={{ padding: '8px 10px' }}>Title</th>
                  <th style={{ padding: '8px 10px' }}>Asset class</th>
                  <th style={{ padding: '8px 10px' }}>Return</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Minimum</th>
                  <th style={{ padding: '8px 10px' }}>Status</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Interest</th>
                  <th style={{ padding: '8px 10px' }} />
                </tr>
              </thead>
              <tbody>
                {opps.map((o) => (
                  <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 10px', fontWeight: 600 }}>
                      {o.name}
                      {o.closes_at ? (
                        <div className="muted" style={{ fontSize: 11 }}>
                          Closes {new Date(o.closes_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: '9px 10px' }} className="muted">{o.asset_class || '—'}</td>
                    <td style={{ padding: '9px 10px' }}>{o.target_irr || '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }} className="num">{o.min_amount ? KES(Number(o.min_amount)) : '—'}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span className={`badge ${STATUS_BADGE[o.status] || 'badge-info'}`}>{o.status}</span>
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }} className="num">{counts.get(o.id) || 0}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                      <form action={removeOpportunity} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={o.id} />
                        <ConfirmSubmit className="btn btn-ghost btn-sm" style={{ color: 'var(--bad)' }} ariaLabel="Remove opportunity" title="Remove this opportunity?" body="This permanently removes the opportunity and members can no longer see it. This can’t be undone." confirmLabel="Remove">
                          <i className="fa-solid fa-trash" />
                        </ConfirmSubmit>
                      </form>
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
