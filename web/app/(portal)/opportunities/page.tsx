import { createClient } from '@/lib/supabase/server';
import { KES } from '@/lib/format';
import { expressInterest } from './actions';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  const [{ data: oppRows }, { data: myInterests }] = await Promise.all([
    supabase.from('opportunities').select('*').eq('status', 'open').order('closes_at', { ascending: true }),
    supabase.from('opportunity_interests').select('opportunity_id').eq('member_id', uid),
  ]);
  const opps = (oppRows ?? []) as any[];
  const mine = new Set(((myInterests ?? []) as any[]).map((i) => i.opportunity_id));

  return (
    <div>
      <div className="page-title">Opportunities</div>
      <div className="sub">
        Open investment opportunities you can express interest in. <span className="badge badge-good">Live</span> New opportunities are published by the office.
      </div>

      {opps.length === 0 ? (
        <div className="card card-pad" style={{ marginTop: 20 }}>
          <div className="muted" style={{ fontSize: 13 }}>No open opportunities right now. New ones published by the office will appear here.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', marginTop: 20 }}>
          {opps.map((o) => {
            const interested = mine.has(o.id);
            const closes = o.closes_at ? new Date(o.closes_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
            return (
              <div key={o.id} className="card card-pad hover-lift">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ fontWeight: 700, maxWidth: '70%' }}>{o.name}</div>
                  {o.asset_class ? <span className="badge badge-info">{o.asset_class}</span> : null}
                </div>
                <div style={{ display: 'flex', gap: 18, margin: '14px 0' }}>
                  <div>
                    <div className="muted" style={{ fontSize: 11 }}>Indicative return</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{o.target_irr || '—'}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 11 }}>Minimum</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{o.min_amount ? KES(Number(o.min_amount)) : '—'}</div>
                  </div>
                </div>
                {o.description ? <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{o.description}</div> : null}
                {closes ? <div className="muted2" style={{ fontSize: 11.5, marginBottom: 10 }}>Closes {closes}</div> : null}
                {interested ? (
                  <div className="badge badge-good" style={{ display: 'flex', justifyContent: 'center', padding: '9px' }}>
                    <i className="fa-solid fa-check" /> Interest recorded
                  </div>
                ) : (
                  <form action={expressInterest}>
                    <input type="hidden" name="opportunity_id" value={o.id} />
                    <button className="btn btn-lime btn-sm" style={{ width: '100%', justifyContent: 'center' }} type="submit">
                      Express interest
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
