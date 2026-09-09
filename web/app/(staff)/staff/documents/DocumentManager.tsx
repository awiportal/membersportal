"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadDocument } from './actions';

type Member = { id: string; full_name: string | null; investor_id: string | null };

const TYPES: readonly [string, string][] = [
  ['statement', 'Statement'],
  ['report', 'Report'],
  ['certificate', 'Certificate'],
  ['welfare_statement', 'Welfare statement'],
  ['guide', 'Guide'],
  ['policy', 'Policy'],
  ['onboarding', 'Onboarding'],
  ['other', 'Other'],
];

export default function DocumentManager({ members }: { members: Member[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('statement');
  const [scope, setScope] = useState<'all' | 'member'>('all');
  const [memberId, setMemberId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!title.trim()) {
      setMsg('Please give the document a title.');
      return;
    }
    if (!file) {
      setMsg('Please choose a file to upload.');
      return;
    }
    if (scope === 'member' && !memberId) {
      setMsg('Please choose which member this document is for.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('title', title.trim());
      fd.set('type', type);
      fd.set('scope', scope);
      if (scope === 'member') fd.set('member_id', memberId);
      fd.set('file', file);
      const res = await uploadDocument(fd);
      if (res?.error) {
        setMsg(res.error);
        return;
      }
      setTitle('');
      setType('statement');
      setScope('all');
      setMemberId('');
      setFile(null);
      setFileKey((k) => k + 1);
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message || 'Could not upload the document. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card card-pad" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Upload a document</div>
      {msg && (
        <div className="badge badge-bad" style={{ marginBottom: 14 }}>
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}
      <div className="field">
        <label>
          Title <span style={{ color: 'var(--lime2)' }}>*</span>
        </label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q2 2026 Fund Statement" />
      </div>
      <div className="field">
        <label>Type</label>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Who can see it</label>
        <select className="input" value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'member')}>
          <option value="all">All members</option>
          <option value="member">One specific member</option>
        </select>
      </div>
      {scope === 'member' && (
        <div className="field">
          <label>
            Member <span style={{ color: 'var(--lime2)' }}>*</span>
          </label>
          <select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Choose a member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || 'Unnamed'}
                {m.investor_id ? ` (${m.investor_id})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label>
          File <span style={{ color: 'var(--lime2)' }}>*</span>
        </label>
        <input
          key={fileKey}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          PDF, Word, Excel or image. Stored privately; members open it via a secure, short-lived link.
        </div>
      </div>
      <button className="btn btn-lime" type="submit" disabled={busy}>
        {busy ? (
          'Uploading…'
        ) : (
          <>
            <i className="fa-solid fa-upload" /> Publish document
          </>
        )}
      </button>
    </form>
  );
}
