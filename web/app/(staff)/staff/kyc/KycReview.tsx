"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { docsFor } from '@/lib/onboarding';
import { getKycDocUrl, reviewKycDoc, setMemberKycStatus } from './actions';

type Doc = {
  id: string;
  member_id: string;
  doc_type: string;
  status: string;
  comment: string | null;
  uploaded_at: string | null;
};
type Member = {
  id: string;
  full_name: string | null;
  investor_id: string | null;
  member_type: string | null;
  kyc_status: string | null;
};
type Group = { member: Member; docs: Doc[]; anyPending: boolean };

const STATUS_CLS: Record<string, string> = { approved: 'badge-good', pending: 'badge-info', rejected: 'badge-bad' };

function cap(s: string | null) {
  return s ? s[0].toUpperCase() + s.slice(1) : 'Pending';
}

export default function KycReview({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});

  async function view(id: string) {
    setBusy('view:' + id);
    setMsg(null);
    try {
      const res = await getKycDocUrl(id);
      if (res?.error || !res?.url) {
        setMsg(res?.error || 'Could not open the file.');
        return;
      }
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(null);
    }
  }

  async function decide(id: string, decision: 'approved' | 'rejected') {
    setBusy(decision + ':' + id);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set('id', id);
      fd.set('decision', decision);
      fd.set('comment', comments[id] || '');
      const res = await reviewKycDoc(fd);
      if (res?.error) {
        setMsg(res.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(memberId: string, status: string) {
    setBusy('m:' + memberId + status);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set('member_id', memberId);
      fd.set('status', status);
      const res = await setMemberKycStatus(fd);
      if (res?.error) {
        setMsg(res.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!groups.length) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="page-title">KYC review</div>
        <div className="sub">Verify members' identity documents.</div>
        <div className="card card-pad" style={{ marginTop: 20 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            No KYC documents have been uploaded yet.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-title">KYC review</div>
      <div className="sub">Verify members' identity documents. Members with documents awaiting review are shown first.</div>
      {msg && (
        <div className="badge badge-bad" style={{ marginTop: 16 }}>
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }}>
        {groups.map(({ member, docs }) => {
          const labels = new Map(docsFor(member.member_type).map((d) => [d.key, d.label]));
          return (
            <div key={member.id} className="card card-pad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700 }}>{member.full_name || 'Unnamed member'}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {member.investor_id || '—'} · {member.member_type || 'individual'}
                  </div>
                </div>
                <span className={`badge ${STATUS_CLS[member.kyc_status || 'pending'] || 'badge-info'}`}>
                  {cap(member.kyc_status)}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {docs.map((d) => (
                  <div
                    key={d.id}
                    style={{ padding: 12, borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontWeight: 600 }}>{labels.get(d.doc_type) || d.doc_type}</div>
                        <span className={`badge ${STATUS_CLS[d.status] || 'badge-info'}`} style={{ fontSize: 11, marginTop: 4 }}>
                          {cap(d.status)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy === 'view:' + d.id}
                        onClick={() => view(d.id)}
                      >
                        <i className="fa-solid fa-eye" /> View
                      </button>
                      <button
                        type="button"
                        className="btn btn-lime btn-sm"
                        disabled={busy === 'approved:' + d.id}
                        onClick={() => decide(d.id, 'approved')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy === 'rejected:' + d.id}
                        onClick={() => decide(d.id, 'rejected')}
                        style={{ color: '#ff8a8a' }}
                      >
                        Reject
                      </button>
                    </div>
                    <input
                      className="input"
                      style={{ marginTop: 8 }}
                      placeholder="Note to the member (shown when you reject)"
                      value={comments[d.id] ?? d.comment ?? ''}
                      onChange={(e) => setComments((c) => ({ ...c, [d.id]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginTop: 12,
                  flexWrap: 'wrap',
                  borderTop: '1px solid var(--border)',
                  paddingTop: 12,
                }}
              >
                <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                  Overall verification:
                </span>
                <button
                  type="button"
                  className="btn btn-lime btn-sm"
                  disabled={busy === 'm:' + member.id + 'approved'}
                  onClick={() => setStatus(member.id, 'approved')}
                >
                  Mark verified
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy === 'm:' + member.id + 'rejected'}
                  onClick={() => setStatus(member.id, 'rejected')}
                  style={{ color: '#ff8a8a' }}
                >
                  Mark rejected
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy === 'm:' + member.id + 'pending'}
                  onClick={() => setStatus(member.id, 'pending')}
                >
                  Reset to pending
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
