'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addAgreement } from './actions';

export default function AgreementAdder() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [required, setRequired] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!title.trim()) { setMsg('Please give the agreement a title.'); return; }
    if (!file) { setMsg('Please choose a file to upload.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('title', title.trim());
      fd.set('description', desc.trim());
      fd.set('required', required ? '1' : '');
      fd.set('file', file);
      const res = await addAgreement(fd);
      if (res?.error) { setMsg(res.error); return; }
      setTitle('');
      setDesc('');
      setRequired(true);
      setFile(null);
      setFileKey((k) => k + 1);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message || 'Could not add the agreement. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card card-pad" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Add an agreement form</div>
      {msg && (
        <div className="badge badge-bad" style={{ marginBottom: 14 }}>
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}
      <div className="field">
        <label>Title <span style={{ color: 'var(--lime2)' }}>*</span></label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Membership Agreement" />
      </div>
      <div className="field">
        <label>Short description (optional)</label>
        <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What this document covers" />
      </div>
      <div className="field">
        <label>Document file <span style={{ color: 'var(--lime2)' }}>*</span></label>
        <input
          key={fileKey}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>PDF or Word. Members open this to read before signing.</div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 16px', cursor: 'pointer', fontSize: 14 }}>
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        <span>Required — members must sign this before submitting their membership</span>
      </label>
      <button className="btn btn-lime" type="submit" disabled={busy}>
        {busy ? 'Uploading…' : <><i className="fa-solid fa-plus" /> Add agreement</>}
      </button>
    </form>
  );
}
