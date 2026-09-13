import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser, getSessionProfile } from '@/lib/session';
import { canViewStaffConsole, isChairlady, isAdmin } from '@/lib/roles';
import { KES } from '@/lib/format';
import { approveExit, markExitPaid, cancelExit } from '../members/[id]/exit-actions';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-warn',
  approved: 'badge-info',
  paid: 'badge-good',
  cancelled: 'badge-bad',
};

// Exit-settlements queue (#162): all departing-member settlements in one place,
// with the segregated approve / pay / cancel actions. Read access for staff and
// the read-only Auditor; write actions re-check role server-side.
export default async function ExitsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const me = await getSessionProfile();
  if (!canViewStaffConsole(me?.role)) redirect('/staff');
  const viewerRole = me?.role as string | undefined;
  const canApprove = isChairlady(viewerRole);
  const canPay = isAdmin(viewerRole);

  const supabase = createClient();
  const { data: rows } = await supabase
    .from('exit_settlements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  const settlements = (rows ?? []) as any[];

  const ids = Array.from(new Set(settlements.map((s) => s.member_id).filter(Boolean)));
  const nameById: Record<string, { full_name: string; investor_id: string | null }> = {};
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name, investor_id').in('id', ids as string[]);
    (profs ?? []).forEach((p: any) => { nameById[p.id] = { full_name: p.full_name, investor_id: p.investor_id }; });
  }

  const open = settlements.filter((s) => s.status === 'draft' || s.status === 'approved');
  const closed = settlements.filter((s) => s.status === 'paid' || s.status === 'cancelled');

  const Card = ({ s }: { s: any }) => {
    const person = nameById[s.member_id];
    return (
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <Link href={`/staff/members/${s.member_id}`} style={{ fontWeight: 700, fontSize: 14 }}>
              {person?.full_name || 'Member'}
            </Link>
            <div className="muted" style={{ fontSize: 12 }}>
              {person?.investor_id || 'No Investor ID'} · initiated {s.initiated_at ? new Date(s.initiated_at).toLocaleDateString('en-GB') : '—'}
            </div>
          </div>
          <span className={`badge ${STATUS_BADGE[s.status] || 'badge-info'}`}>{s.status[0].toUpperCase() + s.status.slice(1)}</span>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 10, fontSize: 13 }}>
          <span className="muted">Gross <strong className="num" style={{ color: 'var(--text)' }}>{KES(Number(s.gross_entitlement || 0))}</strong></span>
          <span className="muted">Already paid <strong className="num" style={{ color: 'var(--text)' }}>{KES(Number(s.amount_already_paid || 0))}</strong></span>
          <span className="muted">Deductions <strong className="num" style={{ color: 'var(--text)' }}>{KES(Number(s.deductions || 0))}</strong></span>
          <span className="muted">Net payable <strong className="num" style={{ color: 'var(--text)' }}>{KES(Number(s.net_payable || 0))}</strong></span>
        </div>
        {s.reason && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Reason: {s.reason}</div>}

        {s.status === 'draft' && (canApprove || canPay) && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            {canApprove && (
              <form action={approveExit}>
                <input type="hidden" name="id" value={s.id} />
                <button className="btn btn-lime btn-sm" type="submit"><i className="fa-solid fa-check" /> Approve</button>
              </form>
            )}
            {canPay && (
              <form action={cancelExit}>
                <input type="hidden" name="id" value={s.id} />
                <button className="btn btn-ghost btn-sm" type="submit"><i className="fa-solid fa-xmark" /> Cancel</button>
              </form>
            )}
          </div>
        )}
        {s.status === 'approved' && canPay && (
          <form action={markExitPaid} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
            <input type="hidden" name="id" value={s.id} />
            <div className="field" style={{ marginBottom: 0, minWidth: 200 }}>
              <label>Payment reference (optional)</label>
              <input className="input" name="reference" placeholder="M-Pesa / bank / cheque ref" />
            </div>
            <button className="btn btn-primary btn-sm" type="submit"><i className="fa-solid fa-money-bill-transfer" /> Mark paid &amp; archive</button>
            <button className="btn btn-ghost btn-sm" type="submit" formAction={cancelExit}><i className="fa-solid fa-xmark" /> Cancel</button>
          </form>
        )}
        {s.status === 'paid' && (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Settled{s.paid_at ? ' on ' + new Date(s.paid_at).toLocaleDateString('en-GB') : ''}{s.reference ? ` · ref ${s.reference}` : ''}. Member archived.
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">Exit settlements</div>
        <div className="sub">Settlement records for departing members. {open.length} open · {closed.length} closed.</div>
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, margin: '4px 0 8px' }}>Open ({open.length})</div>
      {open.length ? open.map((s) => <Card key={s.id} s={s} />) : (
        <div className="card card-pad muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
          No open exit settlements. Start one from a member&apos;s detail page.
        </div>
      )}

      {closed.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 14, margin: '18px 0 8px' }}>Closed ({closed.length})</div>
          {closed.map((s) => <Card key={s.id} s={s} />)}
        </>
      )}
    </div>
  );
}
