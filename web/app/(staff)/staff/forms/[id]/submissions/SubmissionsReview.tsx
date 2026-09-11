'use client';

import { useState } from 'react';
import Link from 'next/link';
import { reviewSubmission, getSignatureUrl } from '../../actions';

const STATUS_CLS: Record<string, string> = {
  approved: 'badge-good',
  submitted: 'badge-info',
  rejected: 'badge-bad',
  draft: 'badge-warn',
};

function SignatureView({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function load() {
    setBusy(true);
    setErr(null);
    const res = await getSignatureUrl(path);
    setBusy(false);
    if (res.url) setUrl(res.url);
    else setErr(res.error || 'Could not load the signature.');
  }
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="Signature" style={{ maxWidth: 260, borderRadius: 10, border: '1px solid var(--border)', background: '#fff' }} />;
  }
  return (
    <div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={busy}>
        <i className="fa-solid fa-pen-nib" /> {busy ? 'Loading…' : 'View signature'}
      </button>
      {err && <div style={{ color: 'var(--bad)', fontSize: 12, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

export default function SubmissionsReview({ form, rows, saved }: { form: any; rows: any[]; saved: boolean }) {
  const fields: any[] = Array.isArray(form.fields) ? form.fields : [];
  const pending = rows.filter((r) => r.status === 'submitted').length;

  return (
    <div style={{ maxWidth: 940, margin: '0 auto' }}>
      <Link href="/staff/forms" className="btn btn-ghost btn-sm">
        <i className="fa-solid fa-arrow-left" /> All forms
      </Link>
      <div className="page-title" style={{ marginTop: 14 }}>{form.title}</div>
      <div className="sub">
        {rows.length} submission{rows.length === 1 ? '' : 's'}{pending ? ` · ${pending} awaiting review` : ''}.
      </div>

      {saved && (
        <div className="badge badge-good" style={{ marginTop: 16, padding: '10px 14px', fontSize: 13 }}>
          <i className="fa-solid fa-circle-check" /> Review saved.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
        {rows.length === 0 && <div className="card card-pad muted" style={{ fontSize: 13 }}>No submissions yet.</div>}
        {rows.map((r) => {
          const answers: any = r.answers && typeof r.answers === 'object' ? r.answers : {};
          const signedName = answers._signed_name;
          return (
            <div key={r.id} className="card card-pad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700 }}>{r.member?.full_name || r.member?.email || 'Member'}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {r.member?.investor_id || '—'}
                    {r.submitted_at ? ` · ${new Date(r.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                  </div>
                </div>
                <span className={`badge ${STATUS_CLS[r.status] || 'badge-warn'}`}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
              </div>

              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {fields.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>This form collects a signature only.</div>}
                {fields.map((f, i) => (
                  <div
                    key={i}
                    style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10, fontSize: 13, borderTop: i ? '1px solid var(--border)' : 'none', paddingTop: i ? 8 : 0 }}
                  >
                    <div className="muted">{f.label}</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{String(answers[f.label] ?? '') || '—'}</div>
                  </div>
                ))}
              </div>

              {(form.require_signature || r.signature_path || signedName) && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Signature</div>
                  {r.signature_path ? (
                    <SignatureView path={r.signature_path} />
                  ) : signedName ? (
                    <div style={{ fontStyle: 'italic' }}>Signed: {String(signedName)}</div>
                  ) : (
                    <div className="muted" style={{ fontSize: 12.5 }}>Not signed.</div>
                  )}
                </div>
              )}

              <form action={reviewSubmission} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="form_id" value={form.id} />
                <input className="input" name="comment" placeholder="Optional note to file" defaultValue={r.comment || ''} style={{ flex: 1, minWidth: 200 }} />
                <button type="submit" name="decision" value="approved" className="btn btn-lime btn-sm">
                  <i className="fa-solid fa-check" /> Approve
                </button>
                <button type="submit" name="decision" value="rejected" className="btn btn-ghost btn-sm" style={{ color: '#ef5a5a' }}>
                  <i className="fa-solid fa-xmark" /> Reject
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
