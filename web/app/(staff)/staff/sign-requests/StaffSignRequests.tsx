'use client';

import { useMemo, useState } from 'react';
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
function fmtDateTime(v?: string | null) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <span className="badge badge-good" style={{ fontSize: 11 }}>
        <i className="fa-solid fa-circle-check" /> Completed
      </span>
    );
  }
  if (status === 'signed') {
    return (
      <span className="badge badge-warn" style={{ fontSize: 11 }}>
        <i className="fa-solid fa-pen-nib" /> Awaiting countersign
      </span>
    );
  }
  return (
    <span className="badge badge-info" style={{ fontSize: 11 }}>
      <i className="fa-regular fa-paper-plane" /> Awaiting signature
    </span>
  );
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
  const [pickQuery, setPickQuery] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const pickedCount = Object.values(picked).filter(Boolean).length;
  const shownMembers = activeMembers.filter((m) => {
    if (!pickQuery.trim()) return true;
    const q = pickQuery.toLowerCase();
    return (
      (m.full_name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)
    );
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const file = fd.get('file');
    if (!title) {
      setMsg('Please give the document a title.');
      return;
    }
    if (!(file instanceof File) || file.size === 0) {
      setMsg('Please choose a PDF to send.');
      return;
    }
    if (mode === 'list' && pickedCount === 0) {
      setMsg('Pick at least one member, or switch to "All active members".');
      return;
    }
    setBusy(true);
    try {
      const res = await sendSignRequest(fd);
      if (res?.error) {
        setMsg(res.error);
        return;
      }
      setMode('all');
      setPicked({});
      setPickQuery('');
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
        <label>
          Title <span style={{ color: 'var(--lime2)' }}>*</span>
        </label>
        <input className="input" name="title" placeholder="e.g. Exit acknowledgement" />
      </div>

      <div className="field">
        <label>Document type</label>
        <select className="input" name="doc_type" defaultValue="other">
          {DOC_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
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
            <span>Pick members{mode === 'list' && pickedCount > 0 ? ` (${pickedCount})` : ''}</span>
          </label>
        </div>
      </div>

      {mode === 'list' && (
        <div className="field">
          <label>Choose members</label>
          {activeMembers.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>
              No active members found.
            </div>
          ) : (
            <>
              <input
                className="input"
                value={pickQuery}
                onChange={(e) => setPickQuery(e.target.value)}
                placeholder="Search name or email"
                style={{ marginBottom: 8 }}
              />
              <div
                style={{
                  maxHeight: 220,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {shownMembers.map((m) => (
                  <label
                    key={m.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5, padding: '4px 2px' }}
                  >
                    <input
                      type="checkbox"
                      name="member_ids"
                      value={m.id}
                      checked={!!picked[m.id]}
                      onChange={(e) => setPicked((prev) => ({ ...prev, [m.id]: e.target.checked }))}
                    />
                    <span style={{ fontWeight: 600 }}>{m.full_name || 'Member'}</span>
                    {m.email ? (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {m.email}
                      </span>
                    ) : null}
                  </label>
                ))}
                {shownMembers.length === 0 && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    No members match &quot;{pickQuery}&quot;.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="field">
        <label>
          PDF document <span style={{ color: 'var(--lime2)' }}>*</span>
        </label>
        <input type="file" name="file" accept=".pdf,application/pdf" />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          PDF only, up to 15 MB.
        </div>
      </div>

      <button className="btn btn-lime" type="submit" disabled={busy}>
        {busy ? (
          'Sending…'
        ) : (
          <>
            <i className="fa-solid fa-paper-plane" /> Send for signing
          </>
        )}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Inline countersign form for one recipient that has status 'signed'
// ---------------------------------------------------------------------------
function CountersignForm({ recipient, onDone }: { recipient: Recipient; onDone: () => void }) {
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
      if (res?.error) {
        setMsg(res.error);
        return;
      }
      onDone();
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message || 'Could not countersign. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ marginTop: 12, display: 'grid', gap: 12, borderTop: '1px dashed var(--border)', paddingTop: 12 }}
    >
      <input type="hidden" name="recipient_id" value={recipient.id} />
      <input type="hidden" name="countersign_signature_kind" value="draw" />
      {msg && (
        <div className="badge badge-bad">
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Countersigned by (optional)</label>
        <input className="input" name="countersigned_name" placeholder="Defaults to your name" />
      </div>
      <div>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>Your signature</label>
        <SignaturePad name="countersign_signature_image" onCapture={setHasSig} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-lime btn-sm" type="submit" disabled={busy || !hasSig}>
          <i className="fa-solid fa-signature" /> {busy ? 'Saving…' : 'Countersign & complete'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// One recipient row inside a request
// ---------------------------------------------------------------------------
function RecipientRow({ rc, canSend }: { rc: Recipient; canSend: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: 12, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{rc.member_name}</div>
          {rc.member_email ? (
            <div className="muted" style={{ fontSize: 12 }}>
              {rc.member_email}
            </div>
          ) : null}
        </div>
        <StatusBadge status={rc.status} />
        {rc.status === 'signed' && canSend && !open && (
          <button className="btn btn-lime btn-sm" type="button" onClick={() => setOpen(true)}>
            <i className="fa-solid fa-signature" /> Countersign
          </button>
        )}
        {rc.status === 'completed' && (
          <a
            href={`/staff/sign-requests/${rc.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
          >
            <i className="fa-solid fa-download" /> Download
          </a>
        )}
      </div>

      {/* Timeline detail */}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {rc.member_signed_at && (
          <span>
            <i className="fa-solid fa-pen" /> Signed {fmtDateTime(rc.member_signed_at)}
          </span>
        )}
        {rc.status === 'completed' && rc.countersigned_at && (
          <span>
            <i className="fa-solid fa-stamp" /> Countersigned by {rc.countersigned_name || 'the office'} on {fmtDateTime(rc.countersigned_at)}
          </span>
        )}
        {rc.status === 'sent' && <span>Not signed yet.</span>}
        {rc.status === 'signed' && !canSend && <span>Awaiting countersignature by an Admin or Chairlady.</span>}
      </div>

      {rc.status === 'signed' && canSend && open && (
        <CountersignForm recipient={rc} onDone={() => setOpen(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One request card with progress + filters + search over its recipients
// ---------------------------------------------------------------------------
type FilterKey = 'all' | 'sent' | 'signed' | 'completed';

function RequestCard({ r, canSend }: { r: SignRequest; canSend: boolean }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    const c = { total: r.recipients.length, sent: 0, signed: 0, completed: 0 };
    for (const rc of r.recipients) {
      if (rc.status === 'completed') c.completed += 1;
      else if (rc.status === 'signed') c.signed += 1;
      else c.sent += 1;
    }
    return c;
  }, [r.recipients]);

  const pct = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return r.recipients.filter((rc) => {
      if (filter !== 'all' && rc.status !== filter) return false;
      if (!query) return true;
      return (
        (rc.member_name || '').toLowerCase().includes(query) ||
        (rc.member_email || '').toLowerCase().includes(query)
      );
    });
  }, [r.recipients, filter, q]);

  const bulk = counts.total > 6;

  const Chip = ({ k, label, tone }: { k: FilterKey; label: string; tone: string }) => (
    <button
      type="button"
      onClick={() => setFilter((cur) => (cur === k ? 'all' : k))}
      className="badge"
      style={{
        cursor: 'pointer',
        fontSize: 11.5,
        background: filter === k ? tone : 'var(--surface)',
        color: filter === k ? '#fff' : 'var(--text)',
        border: '1px solid var(--border)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ padding: 14, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--surface)',
            color: 'var(--purple2)',
          }}
        >
          <i className="fa-solid fa-file-pen" />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600 }}>{r.title}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {docTypeLabel(r.doc_type)}
            {r.created_at ? ` · Sent ${fmtDate(r.created_at)}` : ''}
          </div>
          {r.note ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {r.note}
            </div>
          ) : null}
        </div>
        <div style={{ textAlign: 'right', minWidth: 120 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {counts.completed}/{counts.total}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>completed</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 12, height: 8, borderRadius: 999, background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green, #61CE70)', borderRadius: 999, transition: 'width .3s' }} />
      </div>

      {/* Filter chips */}
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip k="sent" label={`Awaiting signature ${counts.sent}`} tone="#6b7280" />
        <Chip k="signed" label={`Awaiting countersign ${counts.signed}`} tone="#c98a00" />
        <Chip k="completed" label={`Completed ${counts.completed}`} tone="#3a9d52" />
        {filter !== 'all' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter('all')}>
            Clear filter
          </button>
        )}
      </div>

      {canSend && counts.signed > 0 && filter !== 'signed' && (
        <div
          className="badge badge-warn"
          style={{ marginTop: 12, cursor: 'pointer', fontSize: 12 }}
          onClick={() => setFilter('signed')}
        >
          <i className="fa-solid fa-bell" /> {counts.signed} waiting for your countersignature — review
        </div>
      )}

      {/* Search (bulk only) */}
      {bulk && (
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search recipients by name or email"
          style={{ marginTop: 12 }}
        />
      )}

      {/* Recipient list */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxHeight: bulk ? 460 : undefined,
          overflowY: bulk ? 'auto' : undefined,
        }}
      >
        {filtered.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>
            No recipients match this view.
          </div>
        ) : (
          filtered.map((rc) => <RecipientRow key={rc.id} rc={rc} canSend={canSend} />)
        )}
      </div>
    </div>
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
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <div className="page-title">Documents to sign</div>
      <div className="sub">
        Send a PDF to one member, a chosen group, or all active members to sign online. Once a member has signed, an Admin or
        Chairlady countersigns to complete it.
      </div>

      {canSend && (
        <div style={{ marginTop: 20 }}>
          <SendPanel activeMembers={activeMembers} />
        </div>
      )}

      <div className="card card-pad">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Sent documents</div>
        {requests.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>
            No documents sent yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {requests.map((r) => (
              <RequestCard key={r.id} r={r} canSend={canSend} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
