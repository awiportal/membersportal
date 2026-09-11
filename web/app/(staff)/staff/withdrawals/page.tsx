import { createClient } from '@/lib/supabase/server';
import { KES } from '@/lib/format';
import { isAdmin, isChairlady } from '@/lib/roles';
import { reviewWithdrawal, approveWithdrawal, rejectWithdrawal, markWithdrawalPaid } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  submitted: { label: 'Submitted', cls: 'badge-warn' },
  under_review: { label: 'Under review', cls: 'badge-info' },
  approved: { label: 'Approved', cls: 'badge-good' },
  rejected: { label: 'Not approved', cls: 'badge-bad' },
  paid: { label: 'Paid', cls: 'badge-good' },
  cancelled: { label: 'Cancelled', cls: 'badge' },
};

function Badge({ s }: { s?: string }) {
  const meta = STATUS_META[s || ''] ?? STATUS_META.submitted;
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
}

const sumAmount = (rows: any[]) => rows.reduce((t, c) => t + Number(c.amount || 0), 0);

function fmtDate(s?: string | null) {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('en-GB');
  } catch {
    return '';
  }
}

export default async function StaffWithdrawalsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).single()
    : { data: null as any };
  const role = me?.role as string | undefined;
  const canDecide = isChairlady(role);
  const canPay = isAdmin(role);

  const { data: rows, error } = await supabase
    .from('withdrawal_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="page-title">Withdrawals</div>
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="badge badge-warn"><i className="fa-solid fa-screwdriver-wrench" /> Being set up</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            The withdrawal requests table has not been created yet. Apply the v1.5 migration (withdrawal_requests)
            in Supabase, then reload this page.
          </div>
        </div>
      </div>
    );
  }

  const reqs = (rows ?? []) as any[];
  const memberIds = Array.from(new Set(reqs.map((r) => r.member_id).filter(Boolean)));
  let byId: Record<string, any> = {};
  if (memberIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, investor_id, email')
      .in('id', memberIds);
    byId = Object.fromEntries(((profs ?? []) as any[]).map((p) => [p.id, p]));
  }

  // Short-lived signed URLs for the uploaded letters (staff read policy on the bucket).
  const signedByReq: Record<string, string> = {};
  await Promise.all(
    reqs
      .filter((r) => r.letter_path)
      .map(async (r) => {
        const { data } = await supabase.storage.from('withdrawals').createSignedUrl(r.letter_path, 300);
        if (data?.signedUrl) signedByReq[r.id] = data.signedUrl;
      }),
  );

  const submitted = reqs.filter((r) => r.status === 'submitted');
  const underReview = reqs.filter((r) => r.status === 'under_review');
  const approved = reqs.filter((r) => r.status === 'approved');
  const paid = reqs.filter((r) => r.status === 'paid');
  const closed = reqs.filter((r) => ['paid', 'rejected', 'cancelled'].includes(r.status));

  const kpis = [
    { label: 'New requests', value: String(submitted.length), sub: submitted.length ? 'Awaiting review' : 'All caught up', icon: 'fa-inbox', accent: submitted.length > 0 },
    { label: 'Under review', value: String(underReview.length), sub: underReview.length ? 'Awaiting a decision' : 'None', icon: 'fa-magnifying-glass', accent: underReview.length > 0 },
    { label: 'Awaiting payment', value: String(approved.length), sub: approved.length ? `${KES(sumAmount(approved))} to pay` : 'Nothing to pay', icon: 'fa-money-bill-transfer', accent: approved.length > 0 },
    { label: 'Paid', value: String(paid.length), sub: `${KES(sumAmount(paid))} disbursed`, icon: 'fa-circle-check' },
  ];

  const Payout = ({ r }: { r: any }) => (
    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
      {r.method === 'mpesa'
        ? `M-Pesa · ${r.mpesa_phone || '—'}`
        : `Bank · ${[r.bank_name, r.account_name, r.account_number].filter(Boolean).join(' · ') || '—'}`}
    </div>
  );

  const Card = ({ r }: { r: any }) => {
    const m = byId[r.member_id] || {};
    return (
      <div style={{ padding: 12, borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600 }}>{m.full_name || m.email || 'Member'}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {m.investor_id ? `${m.investor_id} · ` : ''}Requested {fmtDate(r.created_at)}
            </div>
          </div>
          <div className="num" style={{ fontWeight: 700, fontSize: 15 }}>{KES(Number(r.amount || 0))}</div>
          <Badge s={r.status} />
        </div>
        <Payout r={r} />
        {r.reason && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{r.reason}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {signedByReq[r.id] && (
            <a href={signedByReq[r.id]} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
              <i className="fa-solid fa-file-arrow-down" /> View letter
            </a>
          )}

          {/* Submitted → any staff can start review */}
          {r.status === 'submitted' && (
            <form action={reviewWithdrawal}>
              <input type="hidden" name="id" value={r.id} />
              <button className="btn btn-primary btn-sm" type="submit"><i className="fa-solid fa-magnifying-glass" /> Start review</button>
            </form>
          )}

          {/* Under review → Chairlady approves or returns */}
          {r.status === 'under_review' && (
            canDecide ? (
              <>
                <form action={approveWithdrawal}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn btn-lime btn-sm" type="submit"><i className="fa-solid fa-check" /> Approve</button>
                </form>
                <form action={rejectWithdrawal} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="hidden" name="id" value={r.id} />
                  <input className="input" name="note" placeholder="Reason (optional)" style={{ height: 32, fontSize: 12.5, maxWidth: 180 }} />
                  <button className="btn btn-ghost btn-sm" type="submit"><i className="fa-solid fa-xmark" /> Return</button>
                </form>
              </>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}><i className="fa-solid fa-user-shield" /> Awaiting Chairlady decision</span>
            )
          )}

          {/* Approved → Admin or Chairlady disburses */}
          {r.status === 'approved' && (
            canPay ? (
              <form action={markWithdrawalPaid}>
                <input type="hidden" name="id" value={r.id} />
                <button className="btn btn-primary btn-sm" type="submit"><i className="fa-solid fa-money-bill-transfer" /> Mark paid</button>
              </form>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}><i className="fa-solid fa-user-shield" /> Awaiting Admin/Chairlady payout</span>
            )
          )}

          {r.status === 'rejected' && r.decision_note && (
            <span className="muted" style={{ fontSize: 12 }}><i className="fa-solid fa-circle-info" /> {r.decision_note}</span>
          )}
        </div>
      </div>
    );
  };

  const Section = ({ title, list, empty }: { title: string; list: any[]; empty: string }) => (
    <div className="card card-pad" style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>
        {title} <span className="muted">({list.length})</span>
      </div>
      {list.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((r) => (
            <Card key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-title">Withdrawals</div>
      <div className="sub">Review member withdrawal requests, approve or return them, and disburse funds. Paid requests post to the member's fund record automatically.</div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', margin: '18px 0 4px' }}>
        {kpis.map((k) => (
          <div key={k.label} className="card kpi">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="lbl">{k.label}</span>
              <span className={`ic ${k.accent ? 'grad-lime' : ''}`} style={{ background: k.accent ? undefined : 'var(--surface2)', color: k.accent ? '#20260a' : 'var(--lime2)' }}>
                <i className={`fa-solid ${k.icon}`} />
              </span>
            </div>
            <div className="val num">{k.value}</div>
            <div style={{ fontSize: 11.5, marginTop: 4, fontWeight: 600, color: 'var(--muted)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <Section title="New requests" list={submitted} empty="No new requests." />
      <Section title="Under review" list={underReview} empty="Nothing under review." />
      <Section title="Awaiting payment" list={approved} empty="No approved requests waiting to be paid." />
      <Section title="Processed" list={closed} empty="Nothing processed yet." />
    </div>
  );
}
