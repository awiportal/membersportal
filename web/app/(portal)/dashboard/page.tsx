import Link from 'next/link';
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

  const [{ data: profile }, { data: holdings }, { data: goals }, { data: contribs }, { data: divs }, { data: fps }, { data: finRows }] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('holdings').select('*').eq('member_id', uid),
      supabase.from('goals').select('*').eq('member_id', uid),
      supabase.from('contributions').select('amount,status').eq('member_id', uid),
      supabase.from('dividends').select('amount,status').eq('member_id', uid),
      supabase.from('financial_profiles').select('*').eq('member_id', uid).order('updated_at', { ascending: false }).limit(1),
      // Member fund position imported from the AWIVEST register (member_finances).
      // Linked to this login via member_id; returns null until staff link it (or
      // before the migration is applied) — the dashboard degrades gracefully.
      supabase.from('member_finances').select('*').eq('member_id', uid).limit(1),
    ]);

  const holds = (holdings ?? []) as any[];
  const gls = (goals ?? []) as any[];
  const fin = ((finRows ?? []) as any[])[0];
  const totalValue = holds.reduce((s, h) => s + Number(h.value || 0), 0);
  const totalContrib = ((contribs ?? []) as any[]).filter((c) => c.status === 'confirmed').reduce((s, c) => s + Number(c.amount || 0), 0);
  const totalDiv = ((divs ?? []) as any[]).filter((d) => d.status === 'paid').reduce((s, d) => s + Number(d.amount || 0), 0);
  const fp = ((fps ?? []) as any[])[0];
  const onTrack = gls.filter((g) => pct(g.saved_amount, g.target_amount) >= 25).length;
  const firstName = String(profile?.full_name || 'there').split(' ')[0];

  const notActive = profile?.status !== 'active';
  const submitted = profile?.onboarding_step === 'submitted';

  // Fall back to the member's registered fund position when live holdings/
  // contributions have not been loaded yet, so the KPIs still show real money.
  const portfolioValue = totalValue || Number(fin?.current_balance || 0);
  const contribValue = totalContrib || Number(fin?.contributions_2026 || 0);

  const byClass: Record<string, number> = {};
  holds.forEach((h) => {
    const k = h.asset_class || 'Other';
    byClass[k] = (byClass[k] || 0) + Number(h.value || 0);
  });
  const segments: Segment[] = Object.entries(byClass).map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }));
  const trend = [0.86, 0.88, 0.9, 0.92, 0.95, 0.97, 1.0].map((f) => Math.round(((portfolioValue || 1) * f) / 1000));
  const empty = holds.length === 0 && !fin;

  const asOf = fin?.as_of
    ? new Date(fin.as_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div className="page-title">Welcome, {firstName}</div>
          <div className="sub">
            {profile?.investor_id ? `${profile.investor_id} · ` : ''}
            {profile?.status === 'active' ? 'Your account is active.' : 'Your account is pending approval — complete your membership below.'}
          </div>
        </div>
        {!empty && !notActive && <LoadDemoData />}
      </div>

      {notActive && (
        <div className="card card-pad" style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', border: '1px solid rgba(166,205,53,0.3)' }}>
          <div className="grad-lime" style={{ width: 46, height: 46, borderRadius: 13, display: 'grid', placeItems: 'center', color: '#20260a', flexShrink: 0 }}>
            <i className={`fa-solid ${submitted ? 'fa-hourglass-half' : 'fa-id-card-clip'}`} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700 }}>{submitted ? 'Membership pending approval' : 'Complete your AWIVEST membership'}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {submitted
                ? 'Your pack is with the committee. Your full portal unlocks automatically once approved.'
                : 'Fill in your details, upload your documents, and submit for approval to unlock the full portal.'}
            </div>
          </div>
          <Link href="/onboarding" className="btn btn-lime">
            {submitted ? 'View status' : 'Continue'} <i className="fa-solid fa-arrow-right" />
          </Link>
        </div>
      )}

      {fin && (
        <div className="card card-pad hover-lift" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Your AWIVEST fund</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {fin.member_no}{asOf ? ` · as at ${asOf}` : ''}
              </div>
            </div>
            {fin.status === 'exiting' && (
              <span className="badge badge-bad">
                <i className="fa-solid fa-right-from-bracket" /> Exiting · refund in process
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Opening balance (31 Dec 2025)</div>
              <div className="num" style={{ fontWeight: 800, fontSize: 20 }}>{KES(Number(fin.opening_balance_2025))}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Contributions 2026</div>
              <div className="num" style={{ fontWeight: 800, fontSize: 20 }}>{KES(Number(fin.contributions_2026))}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Interest 2026</div>
              <div className="num" style={{ fontWeight: 800, fontSize: 20 }}>{KES(Number(fin.total_interest_2026))}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Current balance</div>
              <div className="num" style={{ fontWeight: 800, fontSize: 20, color: 'var(--lime2)' }}>{KES(Number(fin.current_balance))}</div>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>
            Figures from the AWIVEST member register. Britam and Jubilee interest for 2026 are posted once the insurer statements are received.
          </div>
        </div>
      )}

      {empty ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '56px 24px' }}>
          <div className="grad-purple" style={{ width: 70, height: 70, borderRadius: 20, margin: '0 auto 18px', display: 'grid', placeItems: 'center', color: '#fff' }}>
            <i className="fa-solid fa-seedling" style={{ fontSize: 28 }} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>Let&apos;s bring your dashboard to life</div>
          <p className="muted" style={{ fontSize: 14, maxWidth: 460, margin: '10px auto 22px', lineHeight: 1.6 }}>
            Your account and secure profile are ready. Load a sample portfolio to preview how your holdings, allocation and goals will look — everything is stored live in your Supabase database.
          </p>
          {!notActive && <LoadDemoData />}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))', marginBottom: 16 }}>
            <div className="card kpi hover-lift">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="lbl">Portfolio value</span><span className="ic grad-purple" style={{ color: '#fff' }}><i className="fa-solid fa-wallet" /></span></div>
              <div className="val num">{KESc(portfolioValue)}</div>
            </div>
            <div className="card kpi hover-lift">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="lbl">Contributions</span><span className="ic" style={{ background: 'var(--surface2)' }}><i className="fa-solid fa-piggy-bank" style={{ color: 'var(--lime2)' }} /></span></div>
              <div className="val num">{KESc(contribValue)}</div>
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
