'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SignaturePad from '@/components/SignaturePad';
import { sendSignRequest, countersignSignRequest } from './actions';
import { DOC_TYPE_OPTIONS, docTypeLabel } from './docTypes';

type Recipient = {
  id: string;
  member_id: string;
  status: string;
  member_name: string;
  member_email: string;
  member_signed_name?: string | null;
  member_signed_at?: string | null;
  countersigned_name?: string | null;
  countersigned_at?: string | null;
};
type SignRequest = {
  id: string;
  title: string;
  doc_type: string;
  note?: string | null;
  created_at?: string | null;
  recipients: Recipient[];
};
type Member = { id: string; full_name?: string | null; email?: string | null };

function fmtDate(v?: string | null) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return <span className="badge badge-good" style={{ fontSize: 11 }}><i className="fa-solid fa-circle-check" /> Completed</span>;
  }
  if (status === 'signed') {
    return <span className="badge badge-warn" style={{ fontSize: 11 }}>Signed - awaiting countersign</span>;
  }
  return <span className="badge badge-info" style={{ fontSize: 11 }}>Sent</span>;
}

// ---------------------------------------------------------------------------
// Send panel (Admin/Chairlady only)
// ---------------------------------------------------------------------------
function SendPanel({ activeMembers }: { activeMembers: Member[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<'all' | 'list'>('all');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const file = fd.get('file');
    if (!title) { setMsg('Please give the document a title.'); return; }
    if (!(file instanceof File) || file.size === 0) { setMsg('Please choose a PDF to send.'); return; }
    if (mode === 'list' && fd.getAll('member_ids').length === 0) {
      setMsg('Pick at least one member, or switch to "All active members".');
      return;
    }
    setBusy(true);
    try {
      const res = await sendSignRequest(fd);
      if (res?.error) { setMsg(res.error); return; }
      setMode('all');
      setFormKey((k) => k + 1); // reset the form (clears file + fields)
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message || 'Could not send the document. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form key={formKey} onSubmit={onSubmit} className="card card-pad" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Send a document to sign</div>
      {msg && (
        <div className="badge badge-bad" style={{ marginBottom: 14 }}>
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}

      <div className="field">
        <label>Title <span style={{ color: 'var(--lime2)' }}>*</span></label>
        <input className="input" name="title" placeholder="e.g. Exit acknowledgement" />
      </div>

      <div className="field">
        <label>Document type</label>
        <select className="input" name="doc_type" defaultValue="other">
          {DOC_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Note (optional)</label>
        <textarea className="input" name="note" rows={2} placeholder="A short message shown with the request" />
      </div>

      <div className="field">
        <label>Recipients</label>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="radio" name="mode" value="all" checked={mode === 'all'} onChange={() => setMode('all')} />
            <span>All active members</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="radio" name="mode" value="list" checked={mode === 'list'} onChange={() => setMode('list')} />
            <span>Pick members</span>
          </label>
        </div>
      </div>

      {mode === 'list' && (
        <div className="field">
          <label>Choose members</label>
          {activeMembers.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>No active members found.</div>
          ) : (
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeMembers.map((m) => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5, padding: '4px 2px' }}>
                  <input type="checkbox" name="member_ids" value={m.id} />
                  <span style={{ fontWeight: 600 }}>{m.full_name || 'Member'}</span>
                  {m.email ? <span className="muted" style={{ fontSize: 12 }}>{m.email}</span> : null}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="field">
        <label>PDF document <span style={{ color: 'var(--lime2)' }}>*</span></label>
        <input type="file" name="file" accept=".pdf,application/pdf" />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>PDF only, up to 15 MB.</div>
      </div>

      <button className="btn btn-lime" type="submit" disabled={busy}>
        {busy ? 'Sending…' : <><i className="fa-solid fa-paper-plane" /> Send for signing</>}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Inline countersign form for one recipient that has status 'signed'
// ---------------------------------------------------------------------------
function CountersignForm({ recipient }: { recipient: Recipient }) {
  const router = useRouter();
  const [hasSig, setHasSig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await countersignSignRequest(fd);
      if (res?.error) { setMsg(res.error); return; }
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message || 'Could not countersign. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 12, display: 'grid', gap: 12 }}>
      <input type="hidden" name="recipient_id" value={recipient.id} />
      <input type="hidden" name="countersign_signature_kind" value="draw" />
      {msg && (
        <div className="badge badge-bad"><i className="fa-solid fa-circle-exclamation" /> {msg}</div>
      )}
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Countersigned by (optional)</label>
        <input className="input" name="countersigned_name" placeholder="Defaults to your name" />
      </div>
      <div>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>Your signature</label>
        <SignaturePad name="countersign_signature_image" onCapture={setHasSig} />
      </div>
      <div>
        <button className="btn btn-lime btn-sm" type="submit" disabled={busy || !hasSig}>
          <i className="fa-solid fa-signature" /> {busy ? 'Saving…' : 'Countersign & complete'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
export default function StaffSignRequests({
  requests,
  activeMembers,
  canSend,
}: {
  requests: SignRequest[];
  activeMembers: Member[];
  canSend: boolean;
}) {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-title">Documents to sign</div>
      <div className="sub">Send a PDF to one member, a chosen group, or all active members to sign online. Once a member has signed, an Admin or Chairlady countersigns to complete it.</div>

      {canSend && (
        <div style={{ marginTop: 20 }}>
          <SendPanel activeMembers={activeMembers} />
        </div>
      )}

      <div className="card card-pad">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Sent documents</div>
        {requests.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No documents sent yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {requests.map((r) => (
              <div key={r.id} style={{ padding: 14, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: 'var(--purple2)' }}>
                    <i className="fa-solid fa-file-pen" />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600 }}>{r.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {docTypeLabel(r.doc_type)}{r.created_at ? ` · ${fmtDate(r.created_at)}` : ''}
                    </div>
                    {r.note ? <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{r.note}</div> : null}
                  </div>
                  <span className="badge badge-info" style={{ fontSize: 11 }}>{r.recipients.length} recipient{r.recipients.length === 1 ? '' : 's'}</span>
                </div>

                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {r.recipients.map((rc) => (
                    <div key={rc.id} style={{ padding: 12, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{rc.member_name}</div>
                          {rc.member_email ? <div className="muted" style={{ fontSize: 12 }}>{rc.member_email}</div> : null}
                        </div>
                        <StatusBadge status={rc.status} />
                        {rc.status === 'completed' && (
                          <a href={`/staff/sign-requests/${rc.id}/download`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                            <i className="fa-solid fa-download" /> Download signed PDF
                          </a>
                        )}
                      </div>
                      {rc.status === 'signed' && canSend && <CountersignForm recipient={rc} />}
                      {rc.status === 'signed' && !canSend && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Awaiting countersignature by an Admin or Chairlady.</div>
                      )}
                      {rc.status === 'completed' && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                          Countersigned by {rc.countersigned_name || 'the office'}{rc.countersigned_at ? ` on ${fmtDate(rc.countersigned_at)}` : ''}.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
