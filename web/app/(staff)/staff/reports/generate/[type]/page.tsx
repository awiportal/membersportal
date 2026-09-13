import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser, getSessionProfile } from '@/lib/session';
import { canViewStaffConsole, roleLabel } from '@/lib/roles';
import { KES } from '@/lib/format';
import { FIN_COLUMNS, computeFundSummary, n, isExit, type FinRow, type FundSummary } from '@/lib/fundReport';
import { reportDef } from '@/lib/reportDefs';
import ReportToolbar from '../ReportToolbar';

export const dynamic = 'force-dynamic';

// Standard Kenyan resident withholding-tax rate on interest. Default assumption
// for the tax report; must be confirmed with the group's accountant.
const WHT_RATE = 0.15;

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--border)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted2)' };
const thr: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 };
const tdr: React.CSSProperties = { ...td, textAlign: 'right' };

function fmtDate(v?: string | null) {
  if (!v) return '\u2014';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function cap(s?: string | null) {
  const v = String(s || '').replace(/_/g, ' ').trim();
  return v ? v[0].toUpperCase() + v.slice(1) : '\u2014';
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
      {sub ? <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>{sub}</div> : <div style={{ height: 6 }} />}
      {children}
    </div>
  );
}
function StatGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
      {items.map((it) => (
        <div key={it.label} className="card" style={{ padding: '10px 12px' }}>
          <div className="muted" style={{ fontSize: 11 }}>{it.label}</div>
          <div className="num" style={{ fontSize: 16, fontWeight: 700 }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}
function Lines({ lines }: { lines: { label: string; value: number; strong?: boolean }[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} style={l.strong ? { fontWeight: 700 } : undefined}>
            <td style={td}>{l.label}</td>
            <td style={tdr} className="num">{KES(l.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Register({ S }: { S: FundSummary }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={th}>No.</th><th style={th}>Member</th><th style={th}>Status</th>
          <th style={thr}>Opening 2025</th><th style={thr}>Contributions</th><th style={thr}>Interest</th><th style={thr}>Current</th>
        </tr></thead>
        <tbody>
          {S.register.map((r) => (
            <tr key={r.member_no}>
              <td style={td}>{r.member_no}</td>
              <td style={td}>{r.full_name}</td>
              <td style={td}>{cap(r.status)}</td>
              <td style={tdr} className="num">{KES(n(r.opening_balance_2025))}</td>
              <td style={tdr} className="num">{KES(n(r.contributions_2026))}</td>
              <td style={tdr} className="num">{KES(n(r.total_interest_2026))}</td>
              <td style={tdr} className="num">{KES(n(r.current_balance))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr style={{ fontWeight: 700 }}>
          <td style={tdr} colSpan={3}>Totals ({S.register.length})</td>
          <td style={tdr} className="num">{KES(S.regTotals.opening)}</td>
          <td style={tdr} className="num">{KES(S.regTotals.contributions)}</td>
          <td style={tdr} className="num">{KES(S.regTotals.interest)}</td>
          <td style={tdr} className="num">{KES(S.regTotals.current)}</td>
        </tr></tfoot>
      </table>
    </div>
  );
}

export default async function GenerateReportPage({
  params,
  searchParams,
}: {
  params: { type: string };
  searchParams: { print?: string };
}) {
  const def = reportDef(params.type);
  if (!def) notFound();

  const user = await getSessionUser();
  if (!user) redirect('/login');
  const me = await getSessionProfile();
  if (!canViewStaffConsole(me?.role)) redirect('/staff');

  const type = params.type;
  const supabase = createClient();
  const { data: finData } = await supabase.from('member_finances').select(FIN_COLUMNS).order('member_no', { ascending: true });
  const S = computeFundSummary((finData ?? []) as FinRow[]);

  const generatedAt = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const autoPrint = searchParams?.print === '1';

  let body: React.ReactNode = null;

  if (type === 'agm') {
    body = (
      <>
        <StatGrid items={[
          { label: 'Members', value: String(S.members.length) },
          { label: 'Active', value: String(S.active) },
          { label: 'Exiting', value: String(S.exiting) },
          { label: 'Exited', value: String(S.exited) },
          { label: 'Fund under management', value: KES(S.total) },
          { label: 'Total excl. exits', value: KES(S.totalExclExits) },
        ]} />
        <Section title="Fund position" sub="Opening balance carried in, plus 2026 contributions and interest, equals the current fund.">
          <Lines lines={[
            { label: 'Opening balance (to 2025)', value: S.opening },
            { label: '2026 contributions', value: S.contributions },
            { label: '2026 interest', value: S.interest },
            { label: 'Current fund total', value: S.total, strong: true },
            { label: 'Withdrawals paid to exits', value: S.withdrawals },
          ]} />
        </Section>
        <Section title="Interest by partner" sub="How the interest was earned; the parts reconcile to total interest.">
          <Lines lines={[
            { label: 'Britam (insurer interest, life)', value: S.britam },
            { label: 'Jubilee (MMF + FIF)', value: S.jubilee },
            { label: 'Prior years (to 2023)', value: S.priorInterest },
            { label: 'Total interest', value: S.interest, strong: true },
          ]} />
        </Section>
        <Section title={`Member register (${S.register.length})`} sub="Per member, ordered by member number.">
          <Register S={S} />
        </Section>
      </>
    );
  } else if (type === 'finance') {
    body = (
      <>
        <StatGrid items={[
          { label: 'Fund under management', value: KES(S.total) },
          { label: 'Total excl. exits', value: KES(S.totalExclExits) },
          { label: '2026 contributions', value: KES(S.contributions) },
          { label: '2026 interest', value: KES(S.interest) },
        ]} />
        <Section title="Statement of the fund" sub="Opening + contributions + interest = current fund total.">
          <Lines lines={[
            { label: 'Opening balance (to 2025)', value: S.opening },
            { label: 'Add: 2026 contributions', value: S.contributions },
            { label: 'Add: 2026 interest', value: S.interest },
            { label: 'Current fund total', value: S.total, strong: true },
            { label: 'Withdrawals paid to exits', value: S.withdrawals },
          ]} />
        </Section>
        <Section title="Interest by source">
          <Lines lines={[
            { label: 'Britam (insurer interest, life)', value: S.britam },
            { label: 'Jubilee (MMF + FIF)', value: S.jubilee },
            { label: 'Prior years (to 2023)', value: S.priorInterest },
            { label: 'Total interest', value: S.interest, strong: true },
          ]} />
        </Section>
        <Section title="Fund accounts" sub="Non-member accounts included in the fund total.">
          {S.accounts.length ? (
            <Lines lines={[
              ...S.accounts.map((a) => ({ label: a.full_name, value: n(a.current_balance) })),
              { label: 'Fund accounts total', value: S.accountsTotal, strong: true },
            ]} />
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>No separate fund accounts recorded.</div>
          )}
        </Section>
      </>
    );
  } else if (type === 'tax') {
    const taxRows = S.register.filter((r) => n(r.total_interest_2026) > 0);
    let g = 0, w = 0, net = 0;
    const computed = taxRows.map((r) => {
      const gross = n(r.total_interest_2026);
      const wht = Math.round(gross * WHT_RATE * 100) / 100;
      const nt = gross - wht;
      g += gross; w += wht; net += nt;
      return { r, gross, wht, nt };
    });
    body = (
      <>
        <div className="card card-pad" style={{ borderLeft: '3px solid #B22C75', background: 'rgba(178,44,117,0.06)', fontSize: 12.5 }}>
          Withholding tax is estimated at the standard Kenyan resident rate of {(WHT_RATE * 100).toFixed(0)}% on interest income.
          Confirm the applicable rate and any exemptions with your accountant before filing.
        </div>
        <Section title="Withholding tax on member interest" sub="Gross interest earned, estimated withholding tax, and net interest.">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>No.</th><th style={th}>Member</th>
                <th style={thr}>Gross interest</th><th style={thr}>WHT {(WHT_RATE * 100).toFixed(0)}%</th><th style={thr}>Net interest</th>
              </tr></thead>
              <tbody>
                {computed.map(({ r, gross, wht, nt }) => (
                  <tr key={r.member_no}>
                    <td style={td}>{r.member_no}</td>
                    <td style={td}>{r.full_name}</td>
                    <td style={tdr} className="num">{KES(gross)}</td>
                    <td style={tdr} className="num">{KES(wht)}</td>
                    <td style={tdr} className="num">{KES(nt)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{ fontWeight: 700 }}>
                <td style={tdr} colSpan={2}>Totals ({computed.length})</td>
                <td style={tdr} className="num">{KES(g)}</td>
                <td style={tdr} className="num">{KES(w)}</td>
                <td style={tdr} className="num">{KES(net)}</td>
              </tr></tfoot>
            </table>
          </div>
        </Section>
      </>
    );
  } else if (type === 'audit') {
    const recon = S.members.map((r) => {
      const wd = isExit(r) ? n(r.withdrawal) : 0;
      const expected = n(r.opening_balance_2025) + n(r.contributions_2026) + n(r.total_interest_2026) - wd;
      return { r, wd, expected, diff: n(r.current_balance) - expected };
    });
    const flagged = recon.filter((x) => Math.abs(x.diff) > 1);
    const { data: al } = await supabase.from('audit_log').select('id, actor_id, member_id, action, created_at').order('created_at', { ascending: false }).limit(500);
    const auditRows = (al ?? []) as any[];
    const ids = Array.from(new Set(auditRows.flatMap((a) => [a.actor_id, a.member_id]).filter(Boolean)));
    const nameById: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids as string[]);
      (profs ?? []).forEach((p: any) => { nameById[p.id] = p.full_name; });
    }
    const actionCounts: Record<string, number> = {};
    auditRows.forEach((a) => { actionCounts[a.action] = (actionCounts[a.action] || 0) + 1; });
    const topActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]);
    body = (
      <>
        <StatGrid items={[
          { label: 'Members', value: String(S.members.length) },
          { label: 'Fund total', value: KES(S.total) },
          { label: 'Contributions', value: KES(S.contributions) },
          { label: 'Interest', value: KES(S.interest) },
          { label: 'Withdrawals', value: KES(S.withdrawals) },
          { label: 'Reconciliation exceptions', value: String(flagged.length) },
        ]} />
        <Section title="Control totals" sub="Aggregated from the member register.">
          <Lines lines={[
            { label: 'Sum of opening balances (2025)', value: S.regTotals.opening },
            { label: 'Sum of 2026 contributions', value: S.regTotals.contributions },
            { label: 'Sum of 2026 interest', value: S.regTotals.interest },
            { label: 'Sum of current balances', value: S.regTotals.current, strong: true },
            { label: 'Withdrawals paid to exits', value: S.withdrawals },
          ]} />
        </Section>
        <Section title="Reconciliation exceptions" sub="Members where opening + contributions + interest - withdrawals does not equal the current balance (tolerance KES 1).">
          {flagged.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>No.</th><th style={th}>Member</th>
                  <th style={thr}>Expected</th><th style={thr}>Current</th><th style={thr}>Difference</th>
                </tr></thead>
                <tbody>
                  {flagged.map(({ r, expected, diff }) => (
                    <tr key={r.member_no}>
                      <td style={td}>{r.member_no}</td>
                      <td style={td}>{r.full_name}</td>
                      <td style={tdr} className="num">{KES(expected)}</td>
                      <td style={tdr} className="num">{KES(n(r.current_balance))}</td>
                      <td style={tdr} className="num">{KES(diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>All member balances reconcile (opening + contributions + interest - withdrawals = current).</div>
          )}
        </Section>
        <Section title="Audit-log activity" sub={`${auditRows.length} recent entries by action.`}>
          {topActions.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
              <thead><tr><th style={th}>Action</th><th style={thr}>Count</th></tr></thead>
              <tbody>
                {topActions.map(([a, c]) => (
                  <tr key={a}><td style={td}>{cap(a)}</td><td style={tdr} className="num">{c}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>No audit-log entries recorded yet.</div>
          )}
          {auditRows.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>When</th><th style={th}>Action</th><th style={th}>Actor</th></tr></thead>
                <tbody>
                  {auditRows.slice(0, 15).map((a) => (
                    <tr key={a.id}>
                      <td style={td}>{fmtDate(a.created_at)}</td>
                      <td style={td}>{cap(a.action)}</td>
                      <td style={td}>{nameById[a.actor_id] || '\u2014'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Section>
      </>
    );
  } else if (type === 'committee') {
    const [{ data: mtg }, { data: ai }, { data: staff }] = await Promise.all([
      supabase.from('meetings').select('*').order('scheduled_at', { ascending: false }).limit(50),
      supabase.from('meeting_action_items').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('profiles').select('full_name, role, email, status').in('role', ['superadmin', 'admin', 'secretary', 'treasurer', 'auditor']).order('role', { ascending: true }),
    ]);
    const meetings = (mtg ?? []) as any[];
    const actionItems = (ai ?? []) as any[];
    const committee = (staff ?? []) as any[];
    const held = meetings.filter((m) => m.status === 'held').length;
    const scheduled = meetings.filter((m) => m.status === 'scheduled').length;
    const cancelled = meetings.filter((m) => m.status === 'cancelled').length;
    const openItems = actionItems.filter((a) => a.status === 'open');
    body = (
      <>
        <Section title={`Committee (${committee.length})`} sub="Current governance roles.">
          {committee.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Member</th><th style={th}>Role</th><th style={th}>Email</th></tr></thead>
              <tbody>
                {committee.map((c, i) => (
                  <tr key={i}><td style={td}>{c.full_name}</td><td style={td}>{roleLabel(c.role)}</td><td style={td}>{c.email || '\u2014'}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>No committee roles assigned yet.</div>
          )}
        </Section>
        <Section title="Meetings">
          <StatGrid items={[
            { label: 'Total', value: String(meetings.length) },
            { label: 'Held', value: String(held) },
            { label: 'Scheduled', value: String(scheduled) },
            { label: 'Cancelled', value: String(cancelled) },
            { label: 'Open action items', value: String(openItems.length) },
          ]} />
        </Section>
        <Section title="Recent meetings">
          {meetings.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Title</th><th style={th}>Type</th><th style={th}>Date</th><th style={th}>Status</th></tr></thead>
                <tbody>
                  {meetings.map((m) => (
                    <tr key={m.id}><td style={td}>{m.title}</td><td style={td}>{cap(m.meeting_type)}</td><td style={td}>{fmtDate(m.scheduled_at)}</td><td style={td}>{cap(m.status)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>No meetings recorded yet.</div>
          )}
        </Section>
        <Section title={`Open action items (${openItems.length})`}>
          {openItems.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Description</th><th style={th}>Assignee</th><th style={th}>Due</th></tr></thead>
                <tbody>
                  {openItems.map((a) => (
                    <tr key={a.id}><td style={td}>{a.description}</td><td style={td}>{a.assignee || '\u2014'}</td><td style={td}>{fmtDate(a.due_date)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>No open action items.</div>
          )}
        </Section>
      </>
    );
  } else if (type === 'member') {
    body = (
      <>
        <StatGrid items={[
          { label: 'Members', value: String(S.members.length) },
          { label: 'Active', value: String(S.active) },
          { label: 'Exiting', value: String(S.exiting) },
          { label: 'Exited', value: String(S.exited) },
          { label: 'Fund under management', value: KES(S.total) },
        ]} />
        <Section title={`Member roster (${S.register.length})`} sub="Each member's standing and share of the fund.">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>No.</th><th style={th}>Member</th><th style={th}>Status</th>
                <th style={thr}>Current balance</th><th style={thr}>Share of fund</th>
              </tr></thead>
              <tbody>
                {S.register.map((r) => (
                  <tr key={r.member_no}>
                    <td style={td}>{r.member_no}</td>
                    <td style={td}>{r.full_name}</td>
                    <td style={td}>{cap(r.status)}</td>
                    <td style={tdr} className="num">{KES(n(r.current_balance))}</td>
                    <td style={tdr} className="num">{S.total ? ((n(r.current_balance) / S.total) * 100).toFixed(2) + '%' : '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{ fontWeight: 700 }}>
                <td style={tdr} colSpan={3}>Totals ({S.register.length})</td>
                <td style={tdr} className="num">{KES(S.regTotals.current)}</td>
                <td style={tdr} className="num">100%</td>
              </tr></tfoot>
            </table>
          </div>
        </Section>
      </>
    );
  }

  return (
    <div style={{ maxWidth: 940, margin: '0 auto' }}>
      <ReportToolbar title={`AWIVEST ${def.label} ${generatedAt}`} csvHref={`/staff/reports/generate/${type}/csv`} autoPrint={autoPrint} />
      <div className="card card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, borderBottom: '2px solid var(--border)', paddingBottom: 12, marginBottom: 4 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#7A1E50' }}>AWIVEST</div>
            <div className="muted" style={{ fontSize: 12 }}>African Women Investors</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{def.label}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>Generated {generatedAt}</div>
          </div>
        </div>
        {body}
        <div className="muted" style={{ fontSize: 10.5, marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          Generated live from the AWIVEST members portal; figures reconcile to the member register. www.awivest.com &middot; info@awivest.com
        </div>
      </div>
    </div>
  );
}
