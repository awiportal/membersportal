'use client';

import { useMemo, useState } from 'react';
import { postFunds, recordWithdrawal, markExit, settleExit, importSchedule, importCompiled } from './actions';

const MONTHS: [string, string][] = [
  ['jan', 'January'], ['feb', 'February'], ['mar', 'March'], ['apr', 'April'], ['may', 'May'], ['jun', 'June'],
  ['jul', 'July'], ['aug', 'August'], ['sep', 'September'], ['oct', 'October'], ['nov', 'November'], ['dec', 'December'],
];

const kes = (v: any) => (v == null || isNaN(Number(v)) ? '—' : 'KES ' + Number(v).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

type TabId = 'post' | 'schedule' | 'compiled' | 'withdrawals' | 'download';

function ExitTag({ status }: { status?: string }) {
  if (status === 'exiting') return <span className="badge badge-warn" style={{ marginLeft: 6 }}>Exiting</span>;
  if (status === 'exited') return <span className="badge badge-purple" style={{ marginLeft: 6 }}>Exited</span>;
  return null;
}

// Consistent card header used by every action form: an icon chip, a title and a
// one-line description. Keeps all the inputs on this console visually unified.
function FormHead({ icon, title, desc }: { icon: string; title: string; desc: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ flex: 'none', width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface2)', color: 'var(--lime2)' }}>
        <i className={'fa-solid ' + icon} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  );
}

export default function FundDataConsole({ members, accounts = [], flash, canDisburse }: { members: any[]; accounts?: any[]; flash: any; canDisburse?: boolean }) {
  const [tab, setTab] = useState<TabId>('post');
  const [q, setQ] = useState('');
  const [fundType, setFundType] = useState<'contribution' | 'membership' | 'welfare'>('contribution');

  const opts = members.map((m) => (
    <option key={m.member_no} value={m.member_no}>{m.member_no} - {m.full_name}</option>
  ));

  // The balances table filters live by reg. no. or name; the totals row below
  // always reflects exactly the rows on screen, so it doubles as a quick
  // cross-check against the Reports page.
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return members;
    return members.filter((m) => `${m.member_no} ${m.full_name}`.toLowerCase().includes(term));
  }, [members, q]);

  const totals = useMemo(
    () =>
      visible.reduce(
        (t, m) => ({
          contrib: t.contrib + Number(m.contributions_2026 || 0),
          withdrawal: t.withdrawal + Number(m.withdrawal || 0),
          balance: t.balance + Number(m.current_balance || 0),
        }),
        { contrib: 0, withdrawal: 0, balance: 0 }
      ),
    [visible]
  );

  // Whole-register context for the KPI strip (independent of the search filter).
  const allTotals = useMemo(
    () =>
      members.reduce(
        (t, m) => ({
          contrib: t.contrib + Number(m.contributions_2026 || 0),
          withdrawal: t.withdrawal + Number(m.withdrawal || 0),
          balance: t.balance + Number(m.current_balance || 0),
        }),
        { contrib: 0, withdrawal: 0, balance: 0 }
      ),
    [members]
  );
  const activeCount = members.filter((m) => m.status === 'active').length;
  const exitingCount = members.filter((m) => m.status === 'exiting' || m.status === 'exited').length;

  const TABS: [TabId, string, string][] = [
    ['post', 'Post contribution', 'fa-hand-holding-dollar'],
    ['schedule', 'Import 2026 schedule', 'fa-table-list'],
    ['compiled', 'Update compiled', 'fa-file-import'],
    ['withdrawals', 'Withdrawals & exits', 'fa-money-bill-transfer'],
    ['download', 'Download workbook', 'fa-file-excel'],
  ];

  let banner: { kind: string; text: string } | null = null;
  if (flash?.ok) {
    const map: Record<string, string> = {
      posted: 'Contribution posted. The member statement now reflects it.',
      membership: 'Membership fee posted to the pooled Membership fees account.',
      welfare: 'Welfare payment posted to the pooled Welfare account.',
      withdrawal: 'Withdrawal recorded and balances updated.',
      exit: 'Member marked as exiting; refund recorded as pending.',
      settled: 'Exit settled: refund posted as a withdrawal and net balance updated.',
    };
    banner = { kind: 'good', text: map[flash.ok] || 'Saved.' };
  } else if (flash?.err) {
    banner = { kind: 'bad', text: 'Could not save - check the member number and values, then try again.' };
  } else if (flash?.updated != null) {
    const u = Number(flash.updated || 0);
    const f = Number(flash.failed || 0);
    banner = { kind: f ? 'warn' : 'good', text: 'Imported ' + u + ' row' + (u === 1 ? '' : 's') + (f ? '. ' + f + ' row(s) could not be matched - check those and re-paste.' : '.') };
  }
  const bannerBorder = banner ? (banner.kind === 'good' ? 'rgba(55,201,138,0.42)' : banner.kind === 'warn' ? 'rgba(242,178,59,0.42)' : 'rgba(240,97,109,0.42)') : '';
  const bannerColor = banner ? (banner.kind === 'good' ? '#7ef0bf' : banner.kind === 'warn' ? '#f6cd7e' : '#ff9aa2') : '';
  const bannerBg = banner ? (banner.kind === 'good' ? 'rgba(55,201,138,0.09)' : banner.kind === 'warn' ? 'rgba(242,178,59,0.09)' : 'rgba(240,97,109,0.09)') : '';

  const kpis = [
    { l: 'Members', v: String(members.length), sub: `${activeCount} active · ${exitingCount} exiting/exited`, i: 'fa-users', color: 'var(--purple2)' },
    { l: '2026 contributions', v: kes(allTotals.contrib), sub: 'Posted year to date', i: 'fa-hand-holding-dollar', color: 'var(--lime2)' },
    { l: 'Withdrawals', v: allTotals.withdrawal ? kes(allTotals.withdrawal) : 'KES 0.00', sub: 'Paid out to date', i: 'fa-money-bill-transfer', color: 'var(--warn)' },
    { l: 'Current balance', v: kes(allTotals.balance), sub: 'Across all members', i: 'fa-vault', color: 'var(--lime2)' },
  ];

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <div className="page-title">Fund data</div>
      <div className="sub">Post contributions, load a new compiled statement, record withdrawals and exits, and download the live workbook. Every change reflects immediately on member statements.</div>

      <div className="metricgrid" style={{ marginTop: 18 }}>
        {kpis.map((k) => (
          <div key={k.l} className="stat">
            <div className="stat-top"><span className="stat-lbl">{k.l}</span><span className="stat-ic" style={{ background: 'var(--surface2)', color: k.color }}><i className={'fa-solid ' + k.i} /></span></div>
            <div className="stat-val num">{k.v}</div>
            <div className="stat-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {banner && (
        <div style={{ marginTop: 16, borderRadius: 14, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5, fontWeight: 600, border: `1px solid ${bannerBorder}`, color: bannerColor, background: bannerBg }}>
          <i className={'fa-solid ' + (banner.kind === 'good' ? 'fa-circle-check' : banner.kind === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-xmark')} /> {banner.text}
        </div>
      )}

      <div className="tabs" style={{ marginTop: 18, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t[0]} type="button" className={'tab ' + (tab === t[0] ? 'active' : '')} onClick={() => setTab(t[0])}>
            <i className={'fa-solid ' + t[2]} style={{ marginRight: 7, fontSize: 12 }} />{t[1]}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        {tab === 'post' && (
          <form action={postFunds} className="card card-pad" style={{ display: 'grid', gap: 14 }}>
            <FormHead
              icon="fa-hand-holding-dollar"
              title="Add funds"
              desc="Choose what the money is for. It posts to the matching place, the total re-sums automatically and the balance recomputes."
            />

            <div className="field" style={{ margin: 0 }}>
              <label>Fund type</label>
              <select
                className="input"
                name="fund_type"
                value={fundType}
                onChange={(e) => setFundType(e.target.value as 'contribution' | 'membership' | 'welfare')}
              >
                <option value="contribution">Contribution (to a member)</option>
                <option value="membership">Membership fee (pooled account)</option>
                <option value="welfare">Welfare (pooled account)</option>
              </select>
            </div>

            <div className="field" style={{ margin: 0 }}>
              <label>{fundType === 'contribution' ? 'Member' : 'Paid by (optional)'}</label>
              <select className="input" name="member_no" required={fundType === 'contribution'} defaultValue="">
                <option value="">{fundType === 'contribution' ? 'Select a member' : 'Not linked to a member'}</option>
                {opts}
              </select>
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Month</label>
                <select className="input" name="month" required defaultValue="">
                  <option value="" disabled>Select month</option>
                  {MONTHS.map((m) => (<option key={m[0]} value={m[0]}>{m[1]} 2026</option>))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Amount (KES)</label>
                <input className="input" name="amount" type="number" min="1" step="1" required placeholder="e.g. 50000" />
              </div>
            </div>

            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              {fundType === 'contribution'
                ? 'Sets the member\u2019s contribution for the chosen month and recomputes their 2026 total and balance.'
                : fundType === 'membership'
                ? 'Adds to the pooled Membership fees account for the chosen month. A payer, if chosen, is kept in the account\u2019s audit note.'
                : 'Adds to the pooled Welfare account for the chosen month. A payer, if chosen, is kept in the account\u2019s audit note.'}
            </div>

            <div>
              <button className="btn btn-lime" type="submit">
                <i className="fa-solid fa-check" />{' '}
                {fundType === 'contribution' ? 'Post contribution' : fundType === 'membership' ? 'Post membership fee' : 'Post welfare'}
              </button>
            </div>
          </form>
        )}

        {tab === 'schedule' && (
          <form action={importSchedule} className="card card-pad" style={{ display: 'grid', gap: 14 }}>
            <FormHead icon="fa-table-list" title="Import the 2026 contribution schedule" desc={<>One member per line: <code>member_no, Jan, Feb, Mar, ... Dec</code>. Paste straight from the 2026 Contribution Schedule sheet. Blank months count as 0. Balances and the 2026 total recompute for each row.</>} />
            <textarea className="input" name="data" rows={9} required style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} placeholder={'AWI-001, 549000, 0, 489416\nAWI-002, 100000'} />
            <div><button className="btn btn-lime" type="submit"><i className="fa-solid fa-file-import" /> Import schedule</button></div>
          </form>
        )}

        {tab === 'compiled' && (
          <form action={importCompiled} className="card card-pad" style={{ display: 'grid', gap: 14 }}>
            <FormHead icon="fa-file-import" title="Update the compiled statement" desc={<>One member per line, columns in this order: <code>member_no, Contributions(lifetime), Interest 2018-2023, Britam, Jubilee MMF, Jubilee FIF, Jubilee FIF (Apr-Jul), Total Interest, Withdrawal</code>. Paste from the Compiled 2018-Jul 2026 sheet. Each member's TOTAL recomputes.</>} />
            <textarea className="input" name="data" rows={9} required style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} placeholder={'AWI-001, 6920991, 238729, 776918, 1285123, 447877, 30927, 2779575, 0'} />
            <div><button className="btn btn-lime" type="submit"><i className="fa-solid fa-file-import" /> Update compiled</button></div>
          </form>
        )}

        {tab === 'withdrawals' && !canDisburse && (
          <div className="card card-pad muted" style={{ fontSize: 13 }}>
            Recording withdrawals and processing exits is handled by an Admin or the Chairlady.
          </div>
        )}
        {tab === 'withdrawals' && canDisburse && (
          <div style={{ display: 'grid', gap: 16 }}>
            <form action={recordWithdrawal} className="card card-pad" style={{ display: 'grid', gap: 14 }}>
              <FormHead icon="fa-money-bill-transfer" title="Record a withdrawal" desc="Adds to the member's withdrawals and reduces the balance immediately." />
              <div className="field" style={{ margin: 0 }}>
                <label>Member</label>
                <select className="input" name="member_no" required defaultValue="">
                  <option value="" disabled>Select a member</option>
                  {opts}
                </select>
              </div>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                <div className="field" style={{ margin: 0 }}><label>Amount (KES)</label><input className="input" name="amount" type="number" min="1" step="1" required placeholder="e.g. 100000" /></div>
                <div className="field" style={{ margin: 0 }}><label>Note (optional)</label><input className="input" name="note" placeholder="e.g. partial withdrawal" /></div>
              </div>
              <div><button className="btn btn-lime" type="submit"><i className="fa-solid fa-money-bill-transfer" /> Record withdrawal</button></div>
            </form>

            <form action={markExit} className="card card-pad" style={{ display: 'grid', gap: 14 }}>
              <FormHead icon="fa-door-open" title="Mark an exit (refund requested)" desc="Flags the member as exiting and records the refund amount requested as pending. Settle it below once paid." />
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Member</label>
                  <select className="input" name="member_no" required defaultValue="">
                    <option value="" disabled>Select a member</option>
                    {opts}
                  </select>
                </div>
                <div className="field" style={{ margin: 0 }}><label>Refund requested (KES)</label><input className="input" name="refund" type="number" min="0" step="1" placeholder="e.g. 500000" /></div>
              </div>
              <div><button className="btn btn-ghost" type="submit"><i className="fa-solid fa-door-open" /> Mark exiting</button></div>
            </form>

            <form action={settleExit} className="card card-pad" style={{ display: 'grid', gap: 14 }}>
              <FormHead icon="fa-circle-check" title="Settle an exit (refund paid)" desc="Posts the pending refund as a withdrawal, sets the net balance to TOTAL minus the amount paid, and marks the member exited." />
              <div className="field" style={{ margin: 0 }}>
                <label>Member</label>
                <select className="input" name="member_no" required defaultValue="">
                  <option value="" disabled>Select a member</option>
                  {opts}
                </select>
              </div>
              <div><button className="btn btn-ghost" type="submit"><i className="fa-solid fa-circle-check" /> Settle refund</button></div>
            </form>
          </div>
        )}

        {tab === 'download' && (
          <div className="card card-pad" style={{ display: 'grid', gap: 14 }}>
            <FormHead icon="fa-file-excel" title="Download the live workbook" desc="Generates AWI_Member_Contributions_Earnings.xlsx from the current data - Member Register, Compiled 2018-Jul 2026, and 2026 Contribution Schedule sheets - as of right now." />
            <div>
              <a className="btn btn-lime" href="/staff/fund-data/export"><i className="fa-solid fa-file-excel" /> Download .xlsx</a>
            </div>
          </div>
        )}
      </div>

      {accounts.length > 0 && (
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Fund accounts</div>
            <span className="muted" style={{ fontSize: 12 }}>Pooled Membership fees &amp; Welfare — membership/welfare payments post here and are included in the fund total.</span>
          </div>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
            {accounts.map((a) => {
              const isWelfare = String(a.member_no).toUpperCase().includes('WELFARE') || /welfare/i.test(String(a.full_name));
              return (
                <div key={a.member_no} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 14, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <span style={{ flex: 'none', width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: isWelfare ? 'var(--purple2)' : 'var(--lime2)' }}>
                    <i className={'fa-solid ' + (isWelfare ? 'fa-hand-holding-heart' : 'fa-hand-holding-dollar')} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{a.full_name || (isWelfare ? 'Welfare' : 'Membership fees')}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{a.member_no} · 2026 in {kes(a.contributions_2026)}</div>
                  </div>
                  <div className="num" style={{ fontWeight: 800, fontSize: 16 }}>{kes(a.current_balance)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card card-pad" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Current balances</div>
          <span className="badge badge-purple">{visible.length}{visible.length !== members.length ? ` of ${members.length}` : ''}</span>
          <label className="search" style={{ marginLeft: 'auto', maxWidth: 280, flex: '1 1 200px' }}>
            <i className="fa-solid fa-magnifying-glass" />
            <input
              placeholder="Search reg. no. or name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search balances"
              style={{ background: 'transparent', border: 0, outline: 'none', color: 'inherit', width: '100%', fontFamily: 'inherit', fontSize: 13 }}
            />
          </label>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 520, borderRadius: 12, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr className="muted" style={{ textAlign: 'left', fontSize: 11 }}>
                <th scope="col" style={{ padding: '10px 12px', position: 'sticky', top: 0, background: 'var(--menu-bg)', zIndex: 1 }}>Reg. no.</th>
                <th scope="col" style={{ padding: '10px 12px', position: 'sticky', top: 0, background: 'var(--menu-bg)', zIndex: 1 }}>Name</th>
                <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--menu-bg)', zIndex: 1 }}>2026 contrib.</th>
                <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--menu-bg)', zIndex: 1 }}>Withdrawals</th>
                <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', position: 'sticky', top: 0, background: 'var(--menu-bg)', zIndex: 1 }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: '14px 12px', fontSize: 12.5 }}>No members match your search.</td>
                </tr>
              ) : (
                visible.map((m) => (
                  <tr key={m.member_no} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px' }} className="num">{m.member_no}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 600 }}>{m.full_name}<ExitTag status={m.status} /></td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }} className="num">{kes(m.contributions_2026)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right' }} className="num">{m.withdrawal ? kes(m.withdrawal) : '—'}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }} className="num">{kes(m.current_balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {visible.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border2)', position: 'sticky', bottom: 0, background: 'var(--menu-bg)' }}>
                  <td style={{ padding: '10px 12px' }} className="num" />
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>Total ({visible.length})</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }} className="num">{kes(totals.contrib)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }} className="num">{totals.withdrawal ? kes(totals.withdrawal) : '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }} className="num">{kes(totals.balance)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
