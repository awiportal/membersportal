import { createClient } from '@/lib/supabase/server';
import { KES, KESc, pct } from '@/lib/format';
import AreaChart from '@/components/AreaChart';
import Donut, { Segment } from '@/components/Donut';
import LoadDemoData from '@/components/LoadDemoData';

const COLORS = ['#a6398f', '#a6cd35', '#5aa9f0', '#f2b23b', '#ef7fd8', '#37c98a'];

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user!.id;

  const [{ data: profile }, { data: holdings }, { data: goals }, { data: contribs }, { data: divs }, { data: fps }] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('holdings').select('*').eq('member_id', uid),
      supabase.from('goals').select('*').eq('member_id', uid),
      supabase.from('contributions').select('amount,status').eq('member_id', uid),
      supabase.from('dividends').select('amount,status').eq('member_id', uid),
      supabase.from('financial_profiles').select('*').eq('member_id', uid).order('updated_at', { ascending: false }).limit(1),
    ]);

  const holds = (holdings ?? []) as any[];
  const gls = (goals ?? []) as any[];
  const totalValue = holds.reduce((s, h) => s + Number(h.value || 0), 0);
  const totalContrib = ((contribs ?? []) as any[]).filter((c) => c.status === 'confirmed').reduce((s, c) => s + Number(c.amount || 0), 0);
  const totalDiv = ((divs ?? []) as any[]).filter((d) => d.status === 'paid').reduce((s, d) => s + Number(d.amount || 0), 0);
  const fp = ((fps ?? []) as any[])[0];
  const onTrack = gls.filter((g) => pct(g.saved_amount, g.target_amount) >= 25).length;
  const firstName = String(profile?.full_name || 'there').split(' ')[0];

  const byClass: Record<string, number> = {};
  holds.forEach((h) => {
    const k = h.asset_class || 'Other';
    byClass[k] = (byClass[k] || 0) + Number(h.value || 0);
  });
  const segments: Segment[] = Object.entries(byClass).map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }));
  const trend = [0.86, 0.88, 0.9, 0.92, 0.95, 0.97, 1.0].map((f) => Math.round(((totalValue || 1) * f) / 1000));
  const empty = holds.length === 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div className="page-title">Welcome, {firstName}</div>
          <div className="sub">
            {profile?.investor_id ? `${profile.investor_id} · ` : ''}
            {profile?.status === 'active' ? 'Your account is active.' : 'Your account is pending approval — you can still upload KYC.'}
          </div>
        </div>
        {!empty && <LoadDemoData />}
      </div>

      {empty ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '56px 24px' }}>
          <div className="grad-purple" style={{ width: 70, height: 70, borderRadius: 20, margin: '0 auto 18px', display: 'grid', placeItems: 'center', color: '#fff' }}>
            <i className="fa-solid fa-seedling" style={{ fontSize: 28 }} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>Let&apos;s bring your dashboard to life</div>
          <p className="muted" style={{ fontSize: 14, maxWidth: 460, margin: '10px auto 22px', lineHeight: 1.6 }}>
            Your account and secure profile are ready. Load a sample portfolio to preview how your holdings, allocation and goals will look — everything is stored live in your Supabase database.
          </p>
          <LoadDemoData />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))', marginBottom: 16 }}>
            <div className="card kpi hover-lift">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="lbl">Portfolio value</span><span className="ic grad-purple" style={{ color: '#fff' }}><i className="fa-solid fa-wallet" /></span></div>
              <div className="val num">{KESc(totalValue)}</div>
            </div>
            <div className="card kpi hover-lift">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="lbl">Contributions</span><span className="ic" style={{ background: 'var(--surface2)' }}><i className="fa-solid fa-piggy-bank" style={{ color: 'var(--lime2)' }} /></span></div>
              <div className="val num">{KESc(totalContrib)}</div>
            </div>
            <div className="card kpi hover-lift">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="lbl">Dividends received</span><span className="ic" style={{ background: 'var(--surface2)' }}><i className="fa-solid fa-coins" style={{ color: 'var(--lime2)' }} /></span></div>
              <div className="val num">{KESc(totalDiv)}</div>
            </div>
            <div className="card kpi hover-lift">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="lbl">Financial wellness</span><span className="ic" style={{ background: 'var(--surface2)' }}><i className="fa-solid fa-heart-pulse" style={{ color: 'var(--purple2)' }} /></span></div>
              <div className="val num">{fp?.wellness_score ?? '—'}{fp?.wellness_score ? <span className="muted" style={{ fontSize: 15, fontWeight: 600 }}>/100</span> : ''}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1.9fr) minmax(0,1fr)', marginBottom: 16 }} className="dash-grid">
            <div className="card card-pad hover-lift">
              <div style={{ fontWeight: 700, fontSize: 16 }}>Portfolio value</div>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Illustrative trend (historical NAV tracking arrives with statements)</div>
              <AreaChart data={trend} />
            </div>
            <div className="card card-pad hover-lift">
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Asset allocation</div>
              <Donut segments={segments} />
            </div>
          </div>

          <div className="card card-pad hover-lift">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Goal progress</div>
              <span className="badge badge-lime">{onTrack} of {gls.length} on track</span>
            </div>
            {gls.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>No goals yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {gls.map((g) => {
                  const p = pct(g.saved_amount, g.target_amount);
                  return (
                    <div key={g.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13.5 }}>
                        <span style={{ fontWeight: 600 }}>{g.name}</span>
                        <span className="muted num">{p}%</span>
                      </div>
                      <div className="bar"><span style={{ width: `${p}%` }} /></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11 }} className="muted2 num">
                        <span>{KESc(Number(g.saved_amount))}</span><span>{KESc(Number(g.target_amount))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
