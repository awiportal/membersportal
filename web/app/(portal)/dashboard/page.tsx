import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser, getSessionProfile } from '@/lib/session';
import { KES, KESc, pct, interestTotal } from '@/lib/format';
import AreaChart from '@/components/AreaChart';
import Donut, { Segment } from '@/components/Donut';
import MoneyNav from '@/components/MoneyNav';
import LoadDemoData from '@/components/LoadDemoData';
import { isStaff, roleLabel } from '@/lib/roles';

const COLORS = ['#a6398f', '#a6cd35', '#5aa9f0', '#f2b23b', '#ef7fd8', '#37c98a'];

export default async function DashboardPage() {
  const supabase = createClient();
  const user = await getSessionUser();
  const uid = user!.id;

  const [{ data: profile }, { data: holdings }, { data: goals }, { data: contribs }, { data: divs }, { data: fps }, { data: finRows }] =
    await Promise.all([
      getSessionProfile().then((data) => ({ data })),
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

  const role = (profile as any)?.role as string | undefined;
  const staff = isStaff(role);
  const showFundOverview = staff && (fin ? false : true);

  if (showFundOverview) {
    const { data: fundRows } = await supabase
      .from('member_finances')
      .select('member_no, full_name, status, opening_balance_2025, contributions_2026, total_interest_2026, current_balance, member_id')
      .order('current_balance', { ascending: false });
    // Exclude sample/preview member rows (status 'sample') from the fund
    // overview so they never affect member counts or fund totals.
    const rows = ((fundRows ?? []) as any[]).filter((r) => r.status !== 'sample');
    const nn = (v: any) => Number(v || 0);
    const sum = (f: (r: any) => number) => rows.reduce((s, r) => s + f(r), 0);
    // Reconcile exactly with Reports & distribution. The two non-member fund
    // accounts (status 'account') belong in the fund TOTAL but not in member
    // counts; members with status exiting/exited are dropped for "excl. exits".
    const isAccount = (r: any) => r.status === 'account';
    const isExit = (r: any) => r.status === 'exiting' || r.status === 'exited';
    const memberRows = rows.filter((r) => !isAccount(r));
    const totalFund = sum((r) => nn(r.current_balance)); // whole fund, incl. fund accounts
    const totalExclExits = sum((r) => (isExit(r) ? 0 : nn(r.current_balance)));
    const contributions = sum((r) => nn(r.contributions_2026));
    const interest = sum((r) => nn(r.total_interest_2026));
    // Derive opening so the split always reconciles to the fund total, even when
    // a withdrawal sits between contributions+interest and the current balance.
    const opening = totalFund - contributions - interest;
    const accountsTotal = rows.filter(isAccount).reduce((s, r) => s + nn(r.current_balance), 0);
    const exitingBalance = sum((r) => (isExit(r) ? nn(r.current_balance) : 0));
    const activeBalance = totalExclExits - accountsTotal; // active members only
    const w = (v: number) => (totalFund ? (v / totalFund) * 100 : 0);
    const members = memberRows.length;
    const active = memberRows.filter((r) => r.status === 'active').length;
    const exiting = memberRows.filter((r) => r.status === 'exiting').length;
    const exited = memberRows.filter((r) => r.status === 'exited').length;
    const linked = memberRows.filter((r) => r.member_id).length;
    const top = memberRows.slice(0, 6);
    const linkedPct = members ? Math.round((linked / members) * 100) : 0;
    const dist = [
      { label: 'Opening balance (to 2025)', value: opening, color: '#7e2674' },
      { label: '2026 contributions', value: contributions, color: '#a6cd35' },
      { label: 'Interest 2026', value: interest, color: '#5aa9f0' },
    ].filter((d) => d.value > 0);
    const fundSegments: Segment[] = dist.map((d) => ({ label: d.label, value: d.value, color: d.color }));
    const monthsN = 7;
    const ramp = Array.from({ length: monthsN }, (_, i) =>
      Math.round(((opening + ((totalFund - opening) * i) / (monthsN - 1)) / 1000000) * 10) / 10
    );
    const quickLinks = [
      { href: '/staff', icon: 'fa-users-gear', label: 'Approvals & Members', desc: 'Review and manage the register' },
      { href: '/staff/reports', icon: 'fa-chart-pie', label: 'Reports & distribution', desc: 'Fund position and exports' },
      { href: '/staff/kyc', icon: 'fa-id-card-clip', label: 'KYC review', desc: 'Verify member documents' },
      { href: '/staff/fund-records', icon: 'fa-database', label: 'Fund records', desc: 'Identifiers and matching' },
    ];

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <div>
            <div className="page-title">Welcome, {firstName}</div>
            <div className="sub">
              {roleLabel(role)} · fund overview across {members} member{members === 1 ? '' : 's'} · as at 31 Jul 2026
            </div>
          </div>
          <Link href="/staff" className="btn btn-lime">
            <i className="fa-solid fa-gauge-high" /> Staff console
          </Link>
        </div>

        {members === 0 ? (
          <div className="card card-pad" style={{ textAlign: 'center', padding: '56px 24px' }}>
            <div className="grad-purple" style={{ width: 70, height: 70, borderRadius: 20, margin: '0 auto 18px', display: 'grid', placeItems: 'center', color: '#fff' }}>
              <i className="fa-solid fa-database" style={{ fontSize: 26 }} />
            </div>
            <div style={{ fontWeight: 800, fontSize: 20 }}>No fund data loaded yet</div>
            <p className="muted" style={{ fontSize: 14, maxWidth: 460, margin: '10px auto 22px', lineHeight: 1.6 }}>
              Once the AWIVEST register is imported into member_finances, the whole-fund position, distribution and member health appear here.
            </p>
            <Link href="/staff/fund-records" className="btn btn-lime">
              <i className="fa-solid fa-arrow-right" /> Go to Fund records
            </Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))', marginBottom: 16 }}>
              <div className="card kpi hover-lift">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="lbl">Members</span>
                  <span className="ic grad-purple" style={{ color: '#fff' }}><i className="fa-solid fa-users" /></span>
                </div>
                <div className="val num">{members}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{active} active · {exiting} exiting</div>
              </div>
              <div className="card kpi hover-lift">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="lbl">Fund under management</span>
                  <span className="ic grad-lime" style={{ color: '#20260a' }}><i className="fa-solid fa-vault" /></span>
                </div>
                <div className="val num">{KESc(totalFund)}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Excl. exits {KESc(totalExclExits)}</div>
              </div>
              <div className="card kpi hover-lift">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="lbl">2026 contributions</span>
                  <span className="ic" style={{ background: 'var(--surface2)' }}><i className="fa-solid fa-hand-holding-dollar" style={{ color: 'var(--lime2)' }} /></span>
                </div>
                <div className="val num">{KESc(contributions)}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Year to date</div>
              </div>
              <div className="card kpi hover-lift">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="lbl">Interest earned 2026</span>
                  <span className="ic" style={{ background: 'var(--surface2)' }}><i className="fa-solid fa-chart-line" style={{ color: 'var(--lime2)' }} /></span>
                </div>
                <div className="val num">{KESc(interest)}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Britam + Jubilee + prior years</div>
              </div>
            </div>

            <div className="card card-pad hover-lift" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>How Fund under management breaks down</div>
                <Link href="/staff/reports" className="btn btn-ghost btn-sm">Reports &amp; distribution <i className="fa-solid fa-arrow-right" /></Link>
              </div>
              <div className="muted" style={{ fontSize: 12.5, margin: '4px 0 16px' }}>
                The headline {KESc(totalFund)} is the whole fund. Removing the members who are leaving gives {KESc(totalExclExits)} &mdash; the same Total excl. exits figure on Reports &amp; distribution.
              </div>

              <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ width: `${w(activeBalance)}%`, background: 'var(--lime2)' }} />
                <div style={{ width: `${w(accountsTotal)}%`, background: 'var(--purple2)' }} />
                <div style={{ width: `${w(exitingBalance)}%`, background: '#f2b23b' }} />
              </div>

              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginTop: 16 }}>
                {[
                  { c: 'var(--lime2)', l: `Active members (${active})`, v: activeBalance, note: 'Staying in the fund' },
                  { c: 'var(--purple2)', l: 'Fund accounts', v: accountsTotal, note: 'Membership fees + welfare' },
                  { c: '#f2b23b', l: `Exiting members (${exiting})`, v: exitingBalance, note: 'Refunded on exit &mdash; leaving' },
                ].map((seg) => (
                  <div key={seg.l} style={{ padding: 12, borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.c, flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{seg.l}</span>
                    </div>
                    <div className="num" style={{ fontWeight: 800, fontSize: 15, marginTop: 6 }}>{KES(seg.v)}</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }} dangerouslySetInnerHTML={{ __html: seg.note }} />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 210, padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="muted" style={{ fontSize: 11.5 }}>Excl. exits (active members + fund accounts)</div>
                  <div className="num" style={{ fontWeight: 800, fontSize: 17, marginTop: 3 }}>{KES(totalExclExits)}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Matches Reports &amp; distribution</div>
                </div>
                <div style={{ flex: 1, minWidth: 210, padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--lime2)' }}>
                  <div className="muted" style={{ fontSize: 11.5 }}>Fund under management (everything)</div>
                  <div className="num" style={{ fontWeight: 800, fontSize: 17, marginTop: 3, color: 'var(--lime2)' }}>{KES(totalFund)}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Excl. exits + {KES(exitingBalance)} exiting</div>
                </div>
              </div>
            </div>

            <div className="dash-grid" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1.9fr) minmax(0,1fr)', marginBottom: 16 }}>
              <div className="card card-pad hover-lift">
                <div style={{ fontWeight: 700, fontSize: 16 }}>Fund position (KES millions)</div>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Interpolated between opening balance (Dec 2025) and current balance (Jul 2026).</div>
                <AreaChart data={ramp} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Opening {KES(opening)} + contributions {KES(contributions)} + interest {KES(interest)} ={' '}
                  <span style={{ color: 'var(--lime2)' }}>{KES(totalFund)}</span>.
                </div>
              </div>
              <div className="card card-pad hover-lift">
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Money distribution</div>
                {fundSegments.length ? <Donut segments={fundSegments} /> : <div className="muted" style={{ fontSize: 13 }}>No fund data loaded yet.</div>}
              </div>
            </div>

            <div className="dash-grid" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', marginBottom: 16 }}>
              <div className="card card-pad hover-lift">
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Register health</div>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Membership status and how much of the register is linked to a portal login.</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
                  <span className="badge badge-good"><i className="fa-solid fa-circle-check" /> {active} active</span>
                  <span className="badge badge-warn"><i className="fa-solid fa-right-from-bracket" /> {exiting} exiting</span>
                  <span className="badge badge-bad"><i className="fa-solid fa-user-slash" /> {exited} exited</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>Members linked to a login</span>
                  <span className="muted num">{linked}/{members} · {linkedPct}%</span>
                </div>
                <div className="bar"><span style={{ width: `${linkedPct}%` }} /></div>
              </div>
              <div className="card card-pad hover-lift">
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Quick actions</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {quickLinks.map((q) => (
                    <Link key={q.href} href={q.href} className="hover-lift" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      <span className="ic grad-purple" style={{ color: '#fff', width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', flexShrink: 0 }}><i className={`fa-solid ${q.icon}`} /></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{q.label}</span>
                        <span className="muted" style={{ fontSize: 12 }}>{q.desc}</span>
                      </span>
                      <i className="fa-solid fa-chevron-right muted" style={{ fontSize: 12 }} />
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="card card-pad hover-lift">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Top balances</div>
                <Link href="/staff/reports" className="btn btn-ghost btn-sm">Full register <i className="fa-solid fa-arrow-right" /></Link>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                  <thead>
                    <tr className="muted" style={{ textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>Reg. no.</th>
                      <th style={{ padding: '8px 10px' }}>Name</th>
                      <th style={{ padding: '8px 10px' }}>Status</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Current balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((r) => (
                      <tr key={r.member_no} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="num" style={{ padding: '10px', fontWeight: 600 }}>{r.member_no}</td>
                        <td style={{ padding: '10px' }}>{r.full_name}</td>
                        <td style={{ padding: '10px' }}>
                          <span className={`badge ${r.status === 'active' ? 'badge-good' : r.status === 'exiting' ? 'badge-warn' : 'badge-bad'}`}>{r.status}</span>
                        </td>
                        <td className="num" style={{ padding: '10px', textAlign: 'right', fontWeight: 700 }}>{KES(nn(r.current_balance))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }


  // When the member is linked to the AWIVEST register, their real fund figures
  // are authoritative — show those, not any demo holdings that may be loaded.
  const portfolioValue = fin ? Number(fin.current_balance || 0) : totalValue;
  const contribValue = fin
    ? Number(fin.lifetime_contributions || 0) || Number(fin.opening_balance_2025 || 0) + Number(fin.contributions_2026 || 0)
    : totalContrib;
  const dividendsValue = fin ? interestTotal(fin) : totalDiv;

  const byClass: Record<string, number> = {};
  holds.forEach((h) => {
    const k = h.asset_class || 'Other';
    byClass[k] = (byClass[k] || 0) + Number(h.value || 0);
  });
  // Real fund composition for linked members (sums to current balance); the demo
  // holdings allocation is only a fallback before the register is linked.
  const fundComposition: Segment[] = [
    { label: 'Contributions to 2025', value: Number(fin?.opening_balance_2025 || 0), color: '#7e2674' },
    { label: '2026 contributions', value: Number(fin?.contributions_2026 || 0), color: '#a6cd35' },
    { label: 'Interest earned', value: fin ? interestTotal(fin) : 0, color: '#5aa9f0' },
  ].filter((s) => s.value > 0);
  const segments: Segment[] = fin
    ? fundComposition
    : Object.entries(byClass).map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }));
  const trend = [0.86, 0.88, 0.9, 0.92, 0.95, 0.97, 1.0].map((f) => Math.round(((portfolioValue || 1) * f) / 1000));
  const empty = holds.length === 0 && !fin;

  const asOf = fin?.as_of
    ? new Date(fin.as_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  // Compact sparkline path for the Portfolio KPI, built from the value trend.
  const sparkPts = (() => {
    const n = trend.length;
    if (n < 2) return '';
    const mn = Math.min(...trend);
    const mx = Math.max(...trend);
    const rng = mx - mn || 1;
    return trend
      .map((v, i) => `${((i / (n - 1)) * 116).toFixed(1)},${(32 - ((v - mn) / rng) * 26 - 3).toFixed(1)}`)
      .join(' ');
  })();
  // Interest as a share of the current balance (the real growth the fund earned).
  const interestShare = portfolioValue > 0 ? Math.round((dividendsValue / portfolioValue) * 100) : 0;

  return (
    <div>
      <MoneyNav />

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

      {empty ? (
        <div>
          <div className="page-title">Welcome, {firstName}</div>
          <div className="sub">
            {profile?.investor_id ? `${profile.investor_id} \u00b7 ` : ''}
            {profile?.status === 'active' ? 'Your account is active.' : 'Your account is pending approval \u2014 complete your membership below.'}
          </div>
          <div className="card card-pad" style={{ textAlign: 'center', padding: '56px 24px', marginTop: 18 }}>
            <div className="grad-purple" style={{ width: 70, height: 70, borderRadius: 20, margin: '0 auto 18px', display: 'grid', placeItems: 'center', color: '#fff' }}>
              <i className="fa-solid fa-seedling" style={{ fontSize: 28 }} />
            </div>
            <div style={{ fontWeight: 800, fontSize: 20 }}>Let&apos;s bring your dashboard to life</div>
            <p className="muted" style={{ fontSize: 14, maxWidth: 460, margin: '10px auto 22px', lineHeight: 1.6 }}>
              Your account and secure profile are ready. Load a sample portfolio to preview how your holdings, allocation and goals will look &mdash; everything is stored live in your Supabase database.
            </p>
            {!notActive && <LoadDemoData />}
          </div>
        </div>
      ) : (
        <>
          <section className="hero rise">
            <div className="hero-grid">
              <div>
                <div className="hero-eyebrow">
                  Welcome back, {firstName}{fin?.member_no ? ' \u00b7 ' + fin.member_no : ''}
                  {fin?.status === 'exiting' && <span className="badge badge-warn" style={{ marginLeft: 10 }}>Exiting</span>}
                </div>
                <div className="hero-value"><span className="cur">KES</span>{(Number(portfolioValue || 0) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="hero-line">
                  {fin
                    ? `Your live AWIVEST fund position${asOf ? ', as at ' + asOf : ''}.${dividendsValue > 0 ? ' ' + KES(dividendsValue) + ' of your balance is interest earned for you.' : ''}`
                    : 'A preview of how your portfolio, allocation and goals will look once your register record is linked.'}
                </div>
                <div className="hero-pills">
                  <div className="hero-pill"><div className="k">Contributions</div><div className="v num">{KESc(contribValue)}</div></div>
                  <div className="hero-pill"><div className="k">Interest</div><div className="v num">{KESc(dividendsValue)}</div></div>
                  {fp?.wellness_score ? <div className="hero-pill"><div className="k">Wellness</div><div className="v num">{fp.wellness_score}/100</div></div> : null}
                  {fin && asOf ? <div className="hero-pill"><div className="k">As at</div><div className="v num">{asOf}</div></div> : null}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                  <Link href="/portfolio" className="hero-cta"><i className="fa-solid fa-chart-pie" /> Portfolio</Link>
                  <Link href="/statements" className="hero-cta"><i className="fa-solid fa-file-invoice-dollar" /> Statement</Link>
                </div>
              </div>
              <div className="hero-spark">
                <div className="hero-spark-lbl">Value trend (KES thousands)</div>
                <AreaChart data={trend} height={132} />
              </div>
            </div>
          </section>

          {!empty && !notActive && !fin && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}><LoadDemoData /></div>
          )}

          <div className="metricgrid rise-2" style={{ margin: '16px 0' }}>
            <div className="stat">
              <div className="stat-top"><span className="stat-lbl">Portfolio value</span><span className="stat-ic grad-purple" style={{ color: '#fff' }}><i className="fa-solid fa-wallet" /></span></div>
              <div className="stat-val num">{KESc(portfolioValue)}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                <span className="stat-sub" style={{ marginTop: 0 }}>{fin ? 'Live fund balance' : 'Sample preview'}</span>
                {sparkPts && (
                  <svg viewBox="0 0 116 32" width="82" height="24" preserveAspectRatio="none" aria-hidden="true" style={{ overflow: 'visible', flexShrink: 0 }}>
                    <polyline points={sparkPts} fill="none" stroke="var(--lime2)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <div className="stat">
              <div className="stat-top"><span className="stat-lbl">Contributions</span><span className="stat-ic" style={{ background: 'var(--surface2)', color: 'var(--lime2)' }}><i className="fa-solid fa-piggy-bank" /></span></div>
              <div className="stat-val num">{KESc(contribValue)}</div>
              <div style={{ marginTop: 9 }}><span className="badge badge-purple"><i className="fa-solid fa-hand-holding-dollar" /> Principal paid in</span></div>
            </div>
            <div className="stat">
              <div className="stat-top"><span className="stat-lbl">Interest earned</span><span className="stat-ic" style={{ background: 'var(--surface2)', color: 'var(--lime2)' }}><i className="fa-solid fa-coins" /></span></div>
              <div className="stat-val num">{KESc(dividendsValue)}</div>
              <div style={{ marginTop: 9 }}>
                {dividendsValue > 0
                  ? <span className="badge badge-good"><i className="fa-solid fa-arrow-trend-up" /> {interestShare}% of balance</span>
                  : <span className="badge badge-lime">Interest to date</span>}
              </div>
            </div>
            <div className="stat">
              <div className="stat-top"><span className="stat-lbl">Financial wellness</span><span className="stat-ic" style={{ background: 'var(--surface2)', color: 'var(--purple2)' }}><i className="fa-solid fa-heart-pulse" /></span></div>
              <div className="stat-val num">{fp?.wellness_score ?? '\u2014'}{fp?.wellness_score ? <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>/100</span> : null}</div>
              <div style={{ marginTop: 9 }}>
                {fp?.wellness_score
                  ? <span className={`badge ${fp.wellness_score >= 67 ? 'badge-good' : fp.wellness_score >= 34 ? 'badge-warn' : 'badge-bad'}`}>{fp.wellness_score >= 67 ? 'Strong' : fp.wellness_score >= 34 ? 'Building' : 'Needs attention'}</span>
                  : <span className="badge badge-lime">Complete your profile</span>}
              </div>
            </div>
          </div>

          {segments.length > 0 && (
            <div className="card card-pad rise-3">
              <div className="section-head">
                <div>
                  <div className="section-title">{fin ? 'How your balance is built' : 'Asset allocation'}</div>
                  <div className="section-sub">{fin ? 'Principal and interest that make up your current balance.' : 'Your sample holdings by asset class.'}</div>
                </div>
              </div>
              <div className="split">
                <div>
                  <div className="compbar">
                    {segments.map((x) => (
                      <span key={x.label} style={{ width: (portfolioValue ? (x.value / portfolioValue) * 100 : 0) + '%', background: x.color }} />
                    ))}
                  </div>
                  <div className="complegend">
                    {segments.map((x) => (
                      <div key={x.label} className="compitem">
                        <div className="row"><span className="dotc" style={{ background: x.color }} /> {x.label}</div>
                        <div className="amt num">{KESc(x.value)}</div>
                        <div className="shr num">{portfolioValue ? Math.round((x.value / portfolioValue) * 100) : 0}%</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', placeItems: 'center' }}>
                  <Donut segments={segments} />
                </div>
              </div>
              {fin && segments.length > 0 && (
                <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 12.5 }}>
                  {segments.map((x, i) => (
                    <span key={x.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {i > 0 && <span style={{ color: 'var(--muted2)' }}>+</span>}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span className="dotc" style={{ width: 9, height: 9, borderRadius: 3, background: x.color, display: 'inline-block' }} />
                        <span className="num" style={{ color: 'var(--text)', fontWeight: 700 }}>{KESc(x.value)}</span>
                      </span>
                    </span>
                  ))}
                  <span style={{ color: 'var(--muted2)' }}>=</span>
                  <span className="num" style={{ color: 'var(--lime2)', fontWeight: 800, fontSize: 13.5 }}>{KESc(portfolioValue)}</span>
                  <span>current balance</span>
                </div>
              )}
            </div>
          )}

          <div className="split rise-3" style={{ marginTop: 16 }}>
            <div className="card card-pad">
              <div className="section-head">
                <div>
                  <div className="section-title">Portfolio value trend</div>
                  <div className="section-sub">{fin ? 'Illustrative \u2014 historical NAV tracking arrives with statements.' : 'Sample trend.'}</div>
                </div>
              </div>
              <AreaChart data={trend} />
            </div>
            <div className="card card-pad">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div className="section-title">Goal progress</div>
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
          </div>

          {fin && (
            <div className="muted rise-3" style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.5 }}>
              <i className="fa-solid fa-circle-info" style={{ marginRight: 6 }} />
              Figures from the AWIVEST Final Compiled Statement (2018&ndash;Jul 2026). Contributions to end-2025 and for 2026 are shown separately; total interest combines Britam, Jubilee MMF and FIF plus prior-year interest. The four figures sum to your current balance.
            </div>
          )}
        </>
      )}
    </div>
  );
}
