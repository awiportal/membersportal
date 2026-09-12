'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KES } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { submitWithdrawal, cancelWithdrawal } from './actions';
import MoneyNav from '@/components/MoneyNav';

type WReq = {
  id: string;
  amount: number | string;
  reason: string | null;
  reason_type: string | null;
  method: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  mpesa_phone: string | null;
  letter_path: string | null;
  status: string;
  decision_note: string | null;
  created_at: string;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  submitted: { label: 'Submitted', cls: 'badge-warn' },
  under_review: { label: 'Under review', cls: 'badge-info' },
  approved: { label: 'Approved', cls: 'badge-good' },
  rejected: { label: 'Not approved', cls: 'badge-bad' },
  paid: { label: 'Paid', cls: 'badge-good' },
  cancelled: { label: 'Cancelled', cls: 'badge' },
};

const MAX_LETTER_BYTES = 25 * 1024 * 1024; // 25 MB
const LETTER_ACCEPT = 'application/pdf,image/jpeg,image/png';

function letterTypeOk(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (!t) return true; // unknown MIME on some phones — let the office verify
  return t === 'application/pdf' || t === 'image/jpeg' || t === 'image/png' || t.startsWith('image/');
}

function fmtDate(s?: string | null) {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function WithdrawalsClient({
  uid,
  active,
  netBalance,
  requests,
  notReady,
  windowOpen,
  isExiting,
  paidOut,
}: {
  uid: string;
  active: boolean;
  netBalance: number | null;
  requests: WReq[];
  notReady: boolean;
  windowOpen: boolean;
  isExiting: boolean;
  paidOut: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [reasonType, setReasonType] = useState<'exit' | 'other'>(isExiting ? 'exit' : 'other');
  const [method, setMethod] = useState<'bank' | 'mpesa'>('bank');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [cancelling, startCancel] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const amountNum = useMemo(() => Number(String(amount).replace(/[^0-9.]/g, '')) || 0, [amount]);
  const overBalance = netBalance != null && amountNum > netBalance;
  // AWIVEST is a long-term fund. The office opens a payout window when partial
  // payouts are invited; while it is closed, active members cannot request.
  // Members who are leaving the fund ("exiting") can always request their refund.
  const canRequest = windowOpen || isExiting;
  const closedForYou = !canRequest;
  const pendingExists = requests.some((r) => ['submitted', 'under_review', 'approved'].includes(r.status));
  const inProgress = requests.filter((r) => ['submitted', 'under_review', 'approved'].includes(r.status)).length;

  async function submit() {
    setMsg(null);
    if (amountNum <= 0) {
      setMsg({ kind: 'err', text: 'Enter the amount you would like to withdraw.' });
      return;
    }
    if (overBalance) {
      setMsg({ kind: 'err', text: `That is more than your available balance of ${KES(netBalance!)}.` });
      return;
    }
    if (!reason.trim()) {
      setMsg({ kind: 'err', text: 'Please give a brief reason for the withdrawal.' });
      return;
    }
    if (closedForYou) {
      setMsg({
        kind: 'err',
        text: 'Payout requests are currently closed by the office. Your funds remain invested — you can request when the window reopens.',
      });
      return;
    }
    if (method === 'bank' && (!bankName.trim() || !accountName.trim() || !accountNumber.trim())) {
      setMsg({ kind: 'err', text: 'Please complete your bank name, account name and account number.' });
      return;
    }
    if (method === 'mpesa' && !mpesaPhone.trim()) {
      setMsg({ kind: 'err', text: 'Please enter the M-Pesa phone number to send funds to.' });
      return;
    }
    if (!file) {
      setMsg({ kind: 'err', text: 'Please attach your signed withdrawal request letter.' });
      return;
    }
    if (!letterTypeOk(file)) {
      setMsg({ kind: 'err', text: 'The letter must be a PDF, JPG or PNG file.' });
      return;
    }
    if (file.size > MAX_LETTER_BYTES) {
      setMsg({ kind: 'err', text: 'That file is larger than 25 MB. Please attach a smaller file.' });
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const path = `${uid}/letter-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('withdrawals').upload(path, file, { upsert: true });
      if (upErr) throw new Error(upErr.message);

      const res = await submitWithdrawal({
        amount: amountNum,
        reason: reason.trim(),
        reason_type: reasonType,
        method,
        bank_name: method === 'bank' ? bankName.trim() : null,
        account_name: method === 'bank' ? accountName.trim() : null,
        account_number: method === 'bank' ? accountNumber.trim() : null,
        mpesa_phone: method === 'mpesa' ? mpesaPhone.trim() : null,
        letter_path: path,
      });
      if ((res as any)?.error) throw new Error((res as any).error);

      setAmount('');
      setReason('');
      setBankName('');
      setAccountName('');
      setAccountNumber('');
      setMpesaPhone('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setMsg({ kind: 'ok', text: 'Your withdrawal request has been submitted. The office will review it shortly.' });
      router.refresh();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.message || 'We could not submit your request just now. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  function cancel(id: string) {
    startCancel(async () => {
      const res = await cancelWithdrawal(id);
      if (!(res as any)?.error) router.refresh();
    });
  }

  return (
    <div>
      <MoneyNav />

      {notReady ? (
        <>
          <div className="page-title">Withdrawals</div>
          <div className="sub">Request a withdrawal from your AWIVEST balance.</div>
          <div className="card card-pad" style={{ marginTop: 20 }}>
            <div className="badge badge-warn"><i className="fa-solid fa-screwdriver-wrench" /> Being set up</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
              Withdrawal requests are being enabled for your account. Please check back shortly, or contact the AWIVEST office.
            </div>
          </div>
        </>
      ) : (
        <>
          <section className="hero rise">
            <div className="hero-grid">
              <div>
                <div className="hero-eyebrow">Withdrawals{!active ? ' \u00b7 pending approval' : ''}</div>
                <div className="hero-value">
                  <span className="cur">KES</span>
                  {netBalance != null
                    ? netBalance.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '\u2014'}
                </div>
                <div className="hero-line">
                  {netBalance != null
                    ? 'Available to withdraw from your AWIVEST balance. Requests are reviewed by the office before any payout.'
                    : 'Your fund record is not linked yet. You can still request a withdrawal and the office will verify the amount.'}
                </div>
                <div className="hero-pills">
                  <div className="hero-pill"><div className="k">Available</div><div className="v num">{netBalance != null ? KES(netBalance) : '\u2014'}</div></div>
                  <div className="hero-pill"><div className="k">In progress</div><div className="v num">{inProgress}</div></div>
                  <div className="hero-pill"><div className="k">Paid out</div><div className="v num">{paidOut > 0 ? KES(paidOut) : '\u2014'}</div></div>
                </div>
              </div>
              <div className="hero-spark">
                <div className="hero-spark-lbl">How it works</div>
                <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                  {['Enter the amount and where to send it', 'Attach your signed request letter', 'The office reviews and pays out'].map((t, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ width: 22, height: 22, borderRadius: 999, background: 'rgba(166,205,53,0.25)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>{i + 1}</span>
                      <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.86)', lineHeight: 1.4 }}>{t}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          <div className="card card-pad rise-2" style={{ marginTop: 16 }}>
            <div className="section-head">
              <div>
                <div className="section-title">Request a withdrawal</div>
                <div className="section-sub">Complete the details below and attach your signed letter.</div>
              </div>
            </div>

            {!active && (
              <div className="badge badge-warn" style={{ marginBottom: 12 }}>
                <i className="fa-solid fa-lock" /> Available once your membership is approved.
              </div>
            )}

            {isExiting && (
              <div className="badge badge-good" style={{ marginBottom: 12 }}>
                <i className="fa-solid fa-right-from-bracket" /> Your exit is approved{!windowOpen ? ' — you can request your funds now, even though the general payout window is closed' : ' — you can request your funds below'}.
              </div>
            )}

            {closedForYou && (
              <div className="badge badge-warn" style={{ marginBottom: 12 }}>
                <i className="fa-solid fa-lock" /> Payout requests are currently closed by the office. Your funds remain invested; you can request when the window reopens.
              </div>
            )}

            {msg && (
              <div
                style={{
                  marginBottom: 12,
                  borderRadius: 12,
                  fontSize: 13.5,
                  fontWeight: 600,
                  padding: '11px 14px',
                  border: `1px solid ${msg.kind === 'ok' ? 'rgba(166,205,53,0.4)' : 'rgba(239,90,90,0.4)'}`,
                  color: msg.kind === 'ok' ? 'var(--lime2)' : '#ef7f7f',
                  background: msg.kind === 'ok' ? 'rgba(166,205,53,0.08)' : 'rgba(239,90,90,0.08)',
                }}
              >
                <i className={`fa-solid ${msg.kind === 'ok' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} /> {msg.text}
              </div>
            )}

            {pendingExists && (
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
                You already have a withdrawal in progress. You can submit another, but the office processes them in turn.
              </div>
            )}

            <fieldset disabled={!active || busy || closedForYou} style={{ border: 0, padding: 0, margin: 0 }}>
              <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
                <div className="field">
                  <label>Amount to withdraw (KES)</label>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                  {overBalance && (
                    <div className="muted2" style={{ fontSize: 11.5, marginTop: 5, color: '#ef7f7f' }}>
                      Exceeds your available balance.
                    </div>
                  )}
                </div>
                <div className="field">
                  <label>Pay out via</label>
                  <select className="input" value={method} onChange={(e) => setMethod(e.target.value as 'bank' | 'mpesa')}>
                    <option value="bank">Bank transfer</option>
                    <option value="mpesa">M-Pesa</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label>Withdrawal reason</label>
                <select className="input" value={reasonType} onChange={(e) => setReasonType(e.target.value as 'exit' | 'other')}>
                  <option value="other">Partial payout (staying in the fund)</option>
                  <option value="exit">Exit — leaving the fund</option>
                </select>
                {closedForYou && (
                  <div className="muted2" style={{ fontSize: 11.5, marginTop: 5, color: '#ef7f7f', lineHeight: 1.5 }}>
                    Payout requests are currently closed by the office. Members who are exiting the fund can still request their refund.
                  </div>
                )}
              </div>

              <div className="field">
                <label>{reasonType === 'exit' ? 'Reason (why you are leaving)' : 'Reason for withdrawal'}</label>
                <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={reasonType === 'exit' ? 'e.g. relocating, personal circumstances' : 'e.g. school fees, medical, personal'} />
              </div>

              {method === 'bank' ? (
                <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
                  <div className="field">
                    <label>Bank name</label>
                    <input className="input" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Equity Bank" />
                  </div>
                  <div className="field">
                    <label>Account name</label>
                    <input className="input" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Name on the account" />
                  </div>
                  <div className="field">
                    <label>Account number</label>
                    <input className="input" inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" />
                  </div>
                </div>
              ) : (
                <div className="field">
                  <label>M-Pesa phone number</label>
                  <input className="input" inputMode="tel" value={mpesaPhone} onChange={(e) => setMpesaPhone(e.target.value)} placeholder="e.g. +254 712 345678" />
                </div>
              )}

              <div className="field">
                <label>Signed withdrawal letter</label>
                <input
                  ref={fileRef}
                  className="input"
                  type="file"
                  accept={LETTER_ACCEPT}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <div className="muted2" style={{ fontSize: 11.5, marginTop: 5, lineHeight: 1.5 }}>
                  Attach a signed letter requesting this withdrawal. PDF, JPG or PNG, up to 25 MB.
                </div>
              </div>

              <button className="btn btn-lime" style={{ marginTop: 6 }} type="button" onClick={submit} disabled={!active || busy || closedForYou}>
                {busy ? (
                  <><i className="fa-solid fa-spinner fa-spin" /> Submitting…</>
                ) : (
                  <><i className="fa-solid fa-paper-plane" /> Submit request</>
                )}
              </button>
            </fieldset>
          </div>

          <div className="card card-pad rise-3" style={{ marginTop: 16 }}>
            <div className="section-head">
              <div>
                <div className="section-title">Your requests</div>
                <div className="section-sub">{requests.length > 0 ? `${requests.length} request${requests.length === 1 ? '' : 's'} on record.` : 'Requests you make will appear here.'}</div>
              </div>
            </div>
            {requests.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>No withdrawal requests yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {requests.map((r) => {
                  const st = STATUS_META[r.status] ?? STATUS_META.submitted;
                  const canCancel = r.status === 'submitted' || r.status === 'under_review';
                  return (
                    <div key={r.id} style={{ padding: 14, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span className="stat-ic" style={{ background: 'var(--surface)', color: 'var(--lime2)', flex: '0 0 auto', width: 40, height: 40 }}>
                          <i className={`fa-solid ${r.method === 'mpesa' ? 'fa-mobile-screen-button' : 'fa-building-columns'}`} />
                        </span>
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div className="num" style={{ fontWeight: 800, fontSize: 16 }}>{KES(Number(r.amount || 0))}</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {r.method === 'mpesa' ? 'M-Pesa' : 'Bank transfer'} \u00b7 Requested {fmtDate(r.created_at)}
                          </div>
                        </div>
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                      </div>
                      {r.reason_type === 'exit' && (
                        <div style={{ marginTop: 10 }}>
                          <span className="badge badge-warn"><i className="fa-solid fa-right-from-bracket" /> Exit request</span>
                        </div>
                      )}
                      {r.reason && <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{r.reason}</div>}
                      {r.status === 'rejected' && r.decision_note && (
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                          <i className="fa-solid fa-circle-info" /> {r.decision_note}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        {r.letter_path && (
                          <a href={`/withdrawals/letter/${r.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                            <i className="fa-solid fa-file-arrow-down" /> View letter
                          </a>
                        )}
                        {canCancel && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => cancel(r.id)} disabled={cancelling}>
                            <i className="fa-solid fa-xmark" /> Cancel request
                          </button>
                        )}
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
