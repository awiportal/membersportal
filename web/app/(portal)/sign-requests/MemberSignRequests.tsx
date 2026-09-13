'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SignaturePad from '@/components/SignaturePad';
import { signSignRequest, signSequentialStep } from './actions';
import type { CustomField } from '@/lib/customFields';

const TYPE_LABEL: Record<string, string> = {
  enrollment: 'Enrollment',
  claim: 'Claim',
  exit: 'Exit',
  welfare_statement: 'Welfare statement',
  kyc: 'KYC',
  other: 'Other',
};

type Item = {
  id: string;
  status: string;
  title: string;
  doc_type: string;
  note?: string | null;
  member_signed_name?: string | null;
  member_signed_at?: string | null;
  countersigned_name?: string | null;
  countersigned_at?: string | null;
};

type SequentialItem = {
  request_id: string;
  step_id: string;
  title: string;
  doc_type: string;
  note?: string | null;
  completed_at?: string | null;
  my_status: string;
  my_step_order?: number | null;
  my_signed_at?: string | null;
  my_turn: boolean;
  total: number;
  signed: number;
  active_role_label?: string | null;
};

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

function SignForm({ item }: { item: Item }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [hasSig, setHasSig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const canSubmit = name.trim().length > 1 && hasSig && !busy;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await signSignRequest(fd);
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message || 'Could not submit your signature. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 14, display: 'grid', gap: 14 }}>
      <input type="hidden" name="recipient_id" value={item.id} />
      <input type="hidden" name="member_signature_kind" value="draw" />
      {msg && (
        <div className="badge badge-bad">
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Full name</label>
          <input
            className="input"
            name="member_signed_name"
            placeholder="Your full name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Date</label>
          <input className="input" value={today} readOnly aria-readonly="true" tabIndex={-1} style={{ opacity: 0.85, cursor: 'default' }} />
        </div>
      </div>
      <div>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>Signature</label>
        <SignaturePad name="member_signature_image" onCapture={setHasSig} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-lime btn-sm" type="submit" disabled={!canSubmit}>
          <i className="fa-solid fa-signature" /> {busy ? 'Submitting…' : 'Sign & submit'}
        </button>
        <span className="muted" style={{ fontSize: 11.5, flex: 1, minWidth: 200 }}>
          By signing you accept this document. Your name and today&apos;s date ({today}) are recorded for the audit trail.
        </span>
      </div>
    </form>
  );
}

// A participant signs THEIR ordered step of a sequential document.
function SequentialSignForm({ item }: { item: SequentialItem }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [hasSig, setHasSig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fields = item.custom_fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});

  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const requiredOk = fields.every((f) => !f.required || (values[f.key] || '').trim().length > 0);
  const canSubmit = name.trim().length > 1 && hasSig && requiredOk && !busy;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set('custom_field_values', JSON.stringify(values));
    setBusy(true);
    try {
      const res = await signSequentialStep(fd);
      if (res?.error) {
        setMsg(res.error);
        return;
      }
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message || 'Could not submit your signature. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 14, display: 'grid', gap: 14 }}>
      <input type="hidden" name="step_id" value={item.step_id} />
      <input type="hidden" name="signature_kind" value="draw" />
      {msg && (
        <div className="badge badge-bad">
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Full name</label>
          <input
            className="input"
            name="signed_name"
            placeholder="Your full name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Date</label>
          <input className="input" type="date" name="signed_date" defaultValue={todayIso} />
        </div>
      </div>
      {fields.length > 0 && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          {fields.map((f) => (
            <div className="field" style={{ marginBottom: 0 }} key={f.key}>
              <label>
                {f.label}
                {f.required ? <span style={{ color: 'var(--lime2)' }}> *</span> : null}
              </label>
              <input
                className="input"
                type={f.type === 'date' ? 'date' : 'text'}
                required={f.required}
                value={values[f.key] || ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}
      <div>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>Signature</label>
        <SignaturePad name="signature_image" onCapture={setHasSig} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-lime btn-sm" type="submit" disabled={!canSubmit}>
          <i className="fa-solid fa-signature" /> {busy ? 'Submitting…' : 'Sign & submit'}
        </button>
        <span className="muted" style={{ fontSize: 11.5, flex: 1, minWidth: 200 }}>
          You are step {item.my_step_order ?? '-'} of {item.total}. Your name and date are recorded for the audit trail.
        </span>
      </div>
    </form>
  );
}

function SequentialCard({ item }: { item: SequentialItem }) {
  const completed = !!item.completed_at;
  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span
            className="ic"
            style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: 'var(--lime2)' }}
          >
            <i className="fa-solid fa-list-ol" />
          </span>
          <div>
            <div style={{ fontWeight: 700 }}>{item.title}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {TYPE_LABEL[item.doc_type] || 'Other'} · Step {item.my_step_order ?? '-'} of {item.total}
            </div>
            {item.note ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {item.note}
              </div>
            ) : null}
          </div>
        </div>
        {completed ? (
          <span className="badge badge-good">
            <i className="fa-solid fa-circle-check" /> Completed
          </span>
        ) : item.my_turn ? (
          <span className="badge badge-warn">Your turn to sign</span>
        ) : item.my_status === 'signed' ? (
          <span className="badge badge-info">You have signed</span>
        ) : (
          <span className="badge badge-info">Waiting</span>
        )}
      </div>

      {item.my_turn && !completed && <SequentialSignForm item={item} />}

      {!item.my_turn && !completed && (
        <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
          {item.my_status === 'signed' ? (
            <>
              <i className="fa-solid fa-hourglass-half" /> You signed
              {item.my_signed_at ? ` on ${fmtDateTime(item.my_signed_at)}` : ''} — now awaiting {item.active_role_label || 'the next signer'}.
            </>
          ) : (
            <>
              <i className="fa-solid fa-clock" /> Awaiting {item.active_role_label || 'an earlier signer'} before it is your turn.
            </>
          )}
        </div>
      )}

      {completed && (
        <div style={{ marginTop: 14 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            <i className="fa-solid fa-circle-check" /> Signed by all {item.total} signers in order.
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
            <a
              href={`/sign-requests/download/${item.request_id}?sequence=${item.request_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-lime btn-sm"
            >
              <i className="fa-solid fa-file-circle-check" /> View signed document
            </a>
            <a
              href={`/sign-requests/download/${item.request_id}?sequence=${item.request_id}&download=1`}
              className="btn btn-ghost btn-sm"
            >
              <i className="fa-solid fa-download" /> Download
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MemberSignRequests({
  items,
  sequentialItems = [],
}: {
  items: Item[];
  sequentialItems?: SequentialItem[];
}) {
  return (
    <div>
      <div className="page-title">Documents to sign</div>
      <div className="sub">
        Documents the office has sent you to sign online. Once you sign, the office countersigns and the completed document becomes
        available to download.
      </div>

      {sequentialItems.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Documents signed in order</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sequentialItems.map((it) => (
              <SequentialCard key={it.request_id} item={it} />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.length === 0 ? (
          <div className="card card-pad">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Nothing to sign</div>
            <div className="muted" style={{ fontSize: 13 }}>
              When the office sends you a document to sign, it will appear here.
            </div>
          </div>
        ) : (
          items.map((it) => (
            <div key={it.id} className="card card-pad">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span
                    className="ic"
                    style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: 'var(--lime2)' }}
                  >
                    <i className="fa-solid fa-file-pen" />
                  </span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{it.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {TYPE_LABEL[it.doc_type] || 'Other'}
                    </div>
                    {it.note ? (
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {it.note}
                      </div>
                    ) : null}
                  </div>
                </div>
                {it.status === 'completed' ? (
                  <span className="badge badge-good">
                    <i className="fa-solid fa-circle-check" /> Completed
                  </span>
                ) : it.status === 'signed' ? (
                  <span className="badge badge-warn">Signed - awaiting countersignature</span>
                ) : (
                  <span className="badge badge-info">To sign</span>
                )}
              </div>

              {it.status === 'sent' && <SignForm item={it} />}

              {it.status === 'signed' && (
                <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
                  <i className="fa-solid fa-hourglass-half" /> You signed
                  {it.member_signed_at ? ` on ${fmtDateTime(it.member_signed_at)}` : ''} — awaiting countersignature by the office.
                </div>
              )}

              {it.status === 'completed' && (
                <div style={{ marginTop: 14 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {it.member_signed_at && (
                      <span>
                        <i className="fa-solid fa-pen" /> You signed {fmtDateTime(it.member_signed_at)}
                      </span>
                    )}
                    {it.countersigned_at && (
                      <span>
                        <i className="fa-solid fa-stamp" /> Countersigned by {it.countersigned_name || 'the office'} on {fmtDateTime(it.countersigned_at)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
                    <a
                      href={`/sign-requests/download/${it.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-lime btn-sm"
                    >
                      <i className="fa-solid fa-file-circle-check" /> View signed document
                    </a>
                    <a href={`/sign-requests/download/${it.id}?download=1`} className="btn btn-ghost btn-sm">
                      <i className="fa-solid fa-download" /> Download
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
