import { KES } from '@/lib/format';
import { isStaff, isChairlady, isAdmin } from '@/lib/roles';
import { initiateExit, approveExit, markExitPaid, cancelExit } from './exit-actions';

// Exit-settlement card on the staff member-detail page (#162). Shows the current
// settlement (if any) with the segregated approve/pay/cancel actions, or an
// initiate form prefilled from the member's fund snapshot. It is a RECORD only;
// the money itself moves through the withdrawals / fund-data flow.

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-warn',
  approved: 'badge-info',
  paid: 'badge-good',
  cancelled: 'badge-bad',
};

function AmountRow({ k, v, strong, neg }: { k: string; v: number; strong?: boolean; neg?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5, fontWeight: strong ? 700 : 400 }}>
      <span className={strong ? undefined : 'muted'}>{k}</span>
      <span className="num" style={neg ? { color: 'var(--bad)' } : undefined}>{neg ? '\u2212 ' : ''}{KES(v)}</span>
    </div>
  );
}

export default function ExitSettlement({
  memberId,
  settlement,
  snapshot,
  viewerRole,
}: {
  memberId: string;
  settlement: any | null;
  snapshot: { current_balance: number; withdrawal: number };
  viewerRole?: string;
}) {
  const cur = Number(snapshot?.current_balance || 0);
  const paid = Number(snapshot?.withdrawal || 0);
  const grossPrefill = cur + paid;

  const canInitiate = isStaff(viewerRole);
  const canApprove = isChairlady(viewerRole);
  const canPay = isAdmin(viewerRole);

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Exit settlement</div>
        {settlement ? (
          <span className={`badge ${STATUS_BADGE[settlement.status] || 'badge-info'}`}>
            {settlement.status[0].toUpperCase() + settlement.status.slice(1)}
          </span>
        ) : null}
      </div>
      <div className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>
        A formal settlement record for a departing member (draft &rarr; approved &rarr; paid). This records the settlement only; the payout itself is posted through the withdrawals flow. Marking it paid archives the member.
      </div>

      {settlement ? (
        <>
          <AmountRow k="Gross entitlement (contributions + interest)" v={Number(settlement.gross_entitlement || 0)} />
          {Number(settlement.amount_already_paid || 0) > 0 && (
            <AmountRow k="Already paid out" v={Number(settlement.amount_already_paid || 0)} neg />
          )}
          {Number(settlement.deductions || 0) > 0 && (
            <AmountRow k="Deductions on exit" v={Number(settlement.deductions || 0)} neg />
          )}
          <AmountRow k="Net payable to member" v={Number(settlement.net_payable || 0)} strong />
          {settlement.reason && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Reason: {settlement.reason}</div>
          )}
          {settlement.reference && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Payment ref: {settlement.reference}</div>
          )}

          {settlement.status === 'draft' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              {canApprove && (
                <form action={approveExit}>
                  <input type="hidden" name="id" value={settlement.id} />
                  <button className="btn btn-lime" type="submit"><i className="fa-solid fa-check" /> Approve settlement</button>
                </form>
              )}
              {canPay && (
                <form action={cancelExit}>
                  <input type="hidden" name="id" value={settlement.id} />
                  <button className="btn btn-ghost" type="submit"><i className="fa-solid fa-xmark" /> Cancel</button>
                </form>
              )}
              {!canApprove && !canPay && (
                <div className="muted" style={{ fontSize: 12.5 }}>Approval is handled by the Chairlady.</div>
              )}
            </div>
          )}

          {settlement.status === 'approved' && (
            <div style={{ marginTop: 14 }}>
              {canPay ? (
                <form action={markExitPaid} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <input type="hidden" name="id" value={settlement.id} />
                  <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
                    <label>Payment reference (optional)</label>
                    <input className="input" name="reference" placeholder="M-Pesa / bank / cheque ref" />
                  </div>
                  <button className="btn btn-primary" type="submit"><i className="fa-solid fa-money-bill-transfer" /> Mark paid &amp; archive</button>
                  <button className="btn btn-ghost" type="submit" formAction={cancelExit}><i className="fa-solid fa-xmark" /> Cancel</button>
                </form>
              ) : (
                <div className="muted" style={{ fontSize: 12.5 }}>Approved. Payment is recorded by an Admin or the Chairlady.</div>
              )}
            </div>
          )}

          {(settlement.status === 'paid' || settlement.status === 'cancelled') && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
              {settlement.status === 'paid'
                ? `Settled${settlement.paid_at ? ' on ' + new Date(settlement.paid_at).toLocaleDateString('en-GB') : ''}. The member has been archived.`
                : 'This settlement was cancelled.'}
            </div>
          )}
        </>
      ) : canInitiate ? (
        <form action={initiateExit} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', alignItems: 'end' }}>
          <input type="hidden" name="member_id" value={memberId} />
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Gross entitlement (KES)</label>
            <input className="input" name="gross_entitlement" inputMode="decimal" defaultValue={grossPrefill ? String(grossPrefill) : ''} placeholder="0" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Already paid out (KES)</label>
            <input className="input" name="amount_already_paid" inputMode="decimal" defaultValue={paid ? String(paid) : '0'} placeholder="0" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Deductions on exit (KES)</label>
            <input className="input" name="deductions" inputMode="decimal" defaultValue="0" placeholder="0" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Method</label>
            <select className="input" name="method" defaultValue="mpesa">
              <option value="mpesa">M-Pesa</option>
              <option value="bank">Bank transfer</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label>Reason / note (optional)</label>
            <input className="input" name="reason" placeholder="e.g. voluntary exit, relocation" />
          </div>
          <button className="btn btn-primary" type="submit" style={{ gridColumn: '1 / -1', justifySelf: 'start' }}>
            <i className="fa-solid fa-right-from-bracket" /> Initiate exit settlement
          </button>
        </form>
      ) : (
        <div className="muted" style={{ fontSize: 12.5 }}>No exit settlement on file.</div>
      )}
    </div>
  );
}
