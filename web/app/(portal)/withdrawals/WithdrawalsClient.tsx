'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KES } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import { submitWithdrawal, cancelWithdrawal } from './actions';

type WReq = {
  id: string;
  amount: number | string;
  reason: string | null;
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
}: {
  uid: string;
  active: boolean;
  netBalance: number | null;
  requests: WReq[];
  notReady: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
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
  const pendingExists = requests.some((r) => ['submitted', 'under_review', 'approved'].includes(r.status));

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
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-title">Withdrawals</div>
      <div className="sub">Request a withdrawal from your AWIVEST balance, attach your signed letter, and track its progress.</div>

      {notReady ? (
        <div className="card card-pad" style={{ marginTop: 20 }}>
          <div className="badge badge-warn"><i className="fa-solid fa-screwdriver-wrench" /> Being set up</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            Withdrawal requests are being enabled for your account. Please check back shortly, or contact the AWIVEST office.
          </div>
        </div>
      ) : (
        <>
          {/* Balance + request form */}
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', marginTop: 20 }}>
            <div className="card card-pad">
              <div className="muted" style={{ fontSize: 12.5, fontWeight: 500 }}>Available to withdraw</div>
              <div className="num" style={{ fontWeight: 800, fontSize: 26, marginTop: 6 }}>
                {netBalance != null ? KES(netBalance) : '—'}
              </div>
              <div className="muted2" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
                {netBalance != null
                  ? 'Your current net balance. Withdrawals cannot exceed this amount.'
                  : 'Your fund record is not linked yet. You can still request — the office will verify the amount.'}
              </div>
            </div>

            <div className="card card-pad" style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Request a withdrawal</div>

              {!active && (
                <div className="badge badge-warn" style={{ marginBottom: 12 }}>
                  <i className="fa-solid fa-lock" /> Available once your membership is approved.
                </div>
              )}

              {msg && (
                <div
                  className="card-pad"
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

              <fieldset disabled={!active || busy} style={{ border: 0, padding: 0, margin: 0 }}>
                <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
                  <div className="field">
                    <label>Amount to withdraw (KES)</label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
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
                  <label>Reason for withdrawal</label>
                  <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. school fees, medical, personal" />
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

                <button className="btn btn-lime" style={{ marginTop: 6 }} type="button" onClick={submit} disabled={!active || busy}>
                  {busy ? (
                    <><i className="fa-solid fa-spinner fa-spin" /> Submitting…</>
                  ) : (
                    <><i className="fa-solid fa-paper-plane" /> Submit request</>
                  )}
                </button>
              </fieldset>
            </div>
          </div>

          {/* History */}
          <div className="card card-pad" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Your requests</div>
            {requests.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>No withdrawal requests yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {requests.map((r) => {
                  const st = STATUS_META[r.status] ?? STATUS_META.submitted;
                  const canCancel = r.status === 'submitted' || r.status === 'under_review';
                  return (
                    <div key={r.id} style={{ padding: 12, borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div className="num" style={{ fontWeight: 700, fontSize: 15 }}>{KES(Number(r.amount || 0))}</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {r.method === 'mpesa' ? 'M-Pesa' : 'Bank transfer'} · Requested {fmtDate(r.created_at)}
                          </div>
                        </div>
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                      </div>
                      {r.reason && <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{r.reason}</div>}
                      {r.status === 'rejected' && r.decision_note && (
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                          <i className="fa-solid fa-circle-info" /> {r.decision_note}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
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
