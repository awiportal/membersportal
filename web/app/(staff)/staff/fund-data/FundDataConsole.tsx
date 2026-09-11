'use client';

import { useState } from 'react';
import { postContribution, recordWithdrawal, markExit, settleExit, importSchedule, importCompiled } from './actions';

const MONTHS: [string, string][] = [
  ['jan', 'January'], ['feb', 'February'], ['mar', 'March'], ['apr', 'April'], ['may', 'May'], ['jun', 'June'],
  ['jul', 'July'], ['aug', 'August'], ['sep', 'September'], ['oct', 'October'], ['nov', 'November'], ['dec', 'December'],
];

const kes = (v: any) => (v == null || isNaN(Number(v)) ? '—' : 'KES ' + Math.round(Number(v)).toLocaleString('en-KE'));

type TabId = 'post' | 'schedule' | 'compiled' | 'withdrawals' | 'download';

export default function FundDataConsole({ members, flash }: { members: any[]; flash: any }) {
  const [tab, setTab] = useState<TabId>('post');

  const opts = members.map((m) => (
    <option key={m.member_no} value={m.member_no}>{m.member_no} - {m.full_name}</option>
  ));

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

  return (
    <div style={{ maxWidth: 940, margin: '0 auto' }}>
      <div className="page-title">Fund data</div>
      <div className="sub">Post contributions, load a new compiled statement, record withdrawals and exits, and download the live workbook. Every change reflects immediately on member statements.</div>

      {banner && (
        <div className={'badge badge-' + banner.kind} style={{ marginTop: 16, padding: '10px 14px', fontSize: 13 }}>
          <i className={'fa-solid ' + (banner.kind === 'good' ? 'fa-circle-check' : banner.kind === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-xmark')} /> {banner.text}
        </div>
      )}

      <div className="tabs" style={{ marginTop: 18, maxWidth: 760, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t[0]} type="button" className={'tab ' + (tab === t[0] ? 'active' : '')} onClick={() => setTab(t[0])}>
            <i className={'fa-solid ' + t[2]} style={{ marginRight: 7, fontSize: 12 }} />{t[1]}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        {tab === 'post' && (
          <form action={postContribution} className="card card-pad" style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Post a contribution</div>
            <div className="muted" style={{ fontSize: 12.5 }}>Enter one member&apos;s contribution for a month. The 2026 total and balance recompute, and the posting date is saved.</div>
            <div className="field">
              <label>Member</label>
              <select className="input" name="member_no" required defaultValue="">
                <option value="" disabled>Select a member</option>
                {opts}
              </select>
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
              <div className="field">
                <label>Month</label>
                <select className="input" name="month" required defaultValue="">
                  <option value="" disabled>Select month</option>
                  {MONTHS.map((m) => (<option key={m[0]} value={m[0]}>{m[1]} 2026</option>))}
                </select>
              </div>
              <div className="field">
                <label>Amount (KES)</label>
                <input className="input" name="amount" type="number" min="0" step="1" required placeholder="e.g. 50000" />
              </div>
            </div>
            <div><button className="btn btn-lime" type="submit"><i className="fa-solid fa-check" /> Post contribution</button></div>
          </form>
        )}

        {tab === 'schedule' && (
          <form action={importSchedule} className="card card-pad" style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Import the 2026 contribution schedule</div>
            <div className="muted" style={{ fontSize: 12.5 }}>One member per line: <code>member_no, Jan, Feb, Mar, ... Dec</code>. Paste straight from the 2026 Contribution Schedule sheet. Blank months count as 0. Balances and the 2026 total recompute for each row.</div>
            <textarea className="input" name="data" rows={9} required style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} placeholder={'AWI-001, 549000, 0, 489416\nAWI-002, 100000'} />
            <div><button className="btn btn-lime" type="submit"><i className="fa-solid fa-file-import" /> Import schedule</button></div>
          </form>
        )}

        {tab === 'compiled' && (
          <form action={importCompiled} className="card card-pad" style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Update the compiled statement</div>
            <div className="muted" style={{ fontSize: 12.5 }}>One member per line, columns in this order: <code>member_no, Contributions(lifetime), Interest 2018-2023, Britam, Jubilee MMF, Jubilee FIF, Jubilee FIF (Apr-Jul), Total Interest, Withdrawal</code>. Paste from the Compiled 2018-Jul 2026 sheet. Each member&apos;s TOTAL recomputes.</div>
            <textarea className="input" name="data" rows={9} required style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} placeholder={'AWI-001, 6920991, 238729, 776918, 1285123, 447877, 30927, 2779575, 0'} />
            <div><button className="btn btn-lime" type="submit"><i className="fa-solid fa-file-import" /> Update compiled</button></div>
          </form>
        )}

        {tab === 'withdrawals' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <form action={recordWithdrawal} className="card card-pad" style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Record a withdrawal</div>
              <div className="muted" style={{ fontSize: 12.5 }}>Adds to the member&apos;s withdrawals and reduces the balance immediately.</div>
              <div className="field">
                <label>Member</label>
                <select className="input" name="member_no" required defaultValue="">
                  <option value="" disabled>Select a member</option>
                  {opts}
                </select>
              </div>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                <div className="field"><label>Amount (KES)</label><input className="input" name="amount" type="number" min="1" step="1" required placeholder="e.g. 100000" /></div>
                <div className="field"><label>Note (optional)</label><input className="input" name="note" placeholder="e.g. partial withdrawal" /></div>
              </div>
              <div><button className="btn btn-lime" type="submit"><i className="fa-solid fa-money-bill-transfer" /> Record withdrawal</button></div>
            </form>

            <form action={markExit} className="card card-pad" style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Mark an exit (refund requested)</div>
              <div className="muted" style={{ fontSize: 12.5 }}>Flags the member as exiting and records the refund amount requested as pending. Settle it below once paid.</div>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                <div className="field">
                  <label>Member</label>
                  <select className="input" name="member_no" required defaultValue="">
                    <option value="" disabled>Select a member</option>
                    {opts}
                  </select>
                </div>
                <div className="field"><label>Refund requested (KES)</label><input className="input" name="refund" type="number" min="0" step="1" placeholder="e.g. 500000" /></div>
              </div>
              <div><button className="btn btn-ghost" type="submit"><i className="fa-solid fa-door-open" /> Mark exiting</button></div>
            </form>

            <form action={settleExit} className="card card-pad" style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Settle an exit (refund paid)</div>
              <div className="muted" style={{ fontSize: 12.5 }}>Posts the pending refund as a withdrawal, sets the net balance to TOTAL minus the amount paid, and marks the member exited.</div>
              <div className="field">
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
          <div className="card card-pad" style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Download the live workbook</div>
            <div className="muted" style={{ fontSize: 12.5 }}>Generates AWI_Member_Contributions_Earnings.xlsx from the current data - Member Register, Compiled 2018-Jul 2026, and 2026 Contribution Schedule sheets - as of right now.</div>
            <div>
              <a className="btn btn-lime" href="/staff/fund-data/export"><i className="fa-solid fa-file-excel" /> Download .xlsx</a>
            </div>
          </div>
        )}
      </div>

      <div className="card card-pad" style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Current balances</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr className="muted" style={{ textAlign: 'left', fontSize: 11 }}>
                <th style={{ padding: '7px 9px' }}>Reg. no.</th>
                <th style={{ padding: '7px 9px' }}>Name</th>
                <th style={{ padding: '7px 9px', textAlign: 'right' }}>2026 contrib.</th>
                <th style={{ padding: '7px 9px', textAlign: 'right' }}>Withdrawals</th>
                <th style={{ padding: '7px 9px', textAlign: 'right' }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.member_no} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '7px 9px' }} className="num">{m.member_no}</td>
                  <td style={{ padding: '7px 9px', fontWeight: 600 }}>{m.full_name}{m.status === 'exiting' ? ' (exiting)' : m.status === 'exited' ? ' (exited)' : ''}</td>
                  <td style={{ padding: '7px 9px', textAlign: 'right' }} className="num">{kes(m.contributions_2026)}</td>
                  <td style={{ padding: '7px 9px', textAlign: 'right' }} className="num">{m.withdrawal ? kes(m.withdrawal) : '—'}</td>
                  <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 700 }} className="num">{kes(m.current_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
