"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { docsFor } from '@/lib/onboarding';

type Doc = {
  id: string;
  doc_type: string;
  file_path: string;
  status: string;
  comment: string | null;
  uploaded_at: string | null;
  reviewed_at: string | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  approved: { label: 'Approved', cls: 'badge-good' },
  pending: { label: 'In review', cls: 'badge-info' },
  rejected: { label: 'Needs attention', cls: 'badge-bad' },
};

// Uploads go straight to storage, so validate on the client before we ever hit
// the network — otherwise an oversized phone photo or a wrong file type only
// surfaces as a raw storage error. Mirrors the checklist's `accept` spec.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

function fileMatchesAccept(file: File, accept: string): boolean {
  const type = (file.type || '').toLowerCase();
  if (!type) return true; // unknown MIME (some phones) — let staff review be the backstop
  return accept
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .some((t) => (t.endsWith('/*') ? type.startsWith(t.slice(0, -1)) : type === t));
}

export default function KycClient({
  uid,
  memberType,
  kycStatus,
  docs,
}: {
  uid: string;
  memberType: string;
  kycStatus: string | null;
  docs: Doc[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const checklist = docsFor(memberType);
  const byType = new Map(docs.map((d) => [d.doc_type, d]));
  const overall = kycStatus ? STATUS_META[kycStatus] ?? STATUS_META.pending : null;

  async function upload(docKey: string, file: File) {
    setMsg(null);
    const accept = checklist.find((d) => d.key === docKey)?.accept ?? 'image/*,application/pdf';
    if (!fileMatchesAccept(file, accept)) {
      setMsg(
        accept.includes('application/pdf')
          ? 'Please upload an image (JPG or PNG) or a PDF file.'
          : 'Please upload an image file (JPG or PNG).',
      );
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setMsg('That file is larger than 15 MB. Please upload a smaller file — a clear phone photo is usually well under this.');
      return;
    }
    setBusy(docKey);
    try {
      const supabase = createClient();
      const ext = (file.name.split('.').pop() || 'dat').toLowerCase();
      const path = `${uid}/${docKey}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('kyc').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      await supabase.from('kyc_documents').delete().eq('member_id', uid).eq('doc_type', docKey);
      const { error: insErr } = await supabase
        .from('kyc_documents')
        .insert({ member_id: uid, doc_type: docKey, file_path: path, status: 'pending' });
      if (insErr) throw insErr;
      // Re-enter the review queue. This only ever downgrades to pending — it can
      // never approve a member.
      await supabase.from('profiles').update({ kyc_status: 'pending' }).eq('id', uid);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message || 'Upload failed. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function view(d: Doc) {
    setMsg(null);
    setViewing(d.id);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage.from('kyc').createSignedUrl(d.file_path, 120);
      if (error || !data?.signedUrl) throw error || new Error('no url');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setMsg('Could not open this file. Please try again.');
    } finally {
      setViewing(null);
    }
  }

  return (
    <div>
      <div className="page-title">KYC Verification</div>
      <div className="sub">
        Upload the identity documents AWIVEST needs to verify your membership. Your files are stored privately and only
        shared with the AWIVEST review team.
      </div>

      <div
        className="card card-pad"
        style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--surface2)',
            color: 'var(--purple2)',
          }}
        >
          <i className="fa-solid fa-id-card-clip" />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700 }}>Verification status</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {kycStatus === 'approved'
              ? 'Your identity is verified. Thank you.'
              : kycStatus === 'rejected'
              ? 'One or more documents need your attention — see the notes below and re-upload.'
              : 'Your documents are with the review team. We will update this once reviewed.'}
          </div>
        </div>
        {overall && <span className={`badge ${overall.cls}`}>{overall.label}</span>}
      </div>

      {msg && (
        <div className="badge badge-bad" style={{ marginTop: 16 }}>
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Your documents</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {checklist.map((doc) => {
            const existing = byType.get(doc.key);
            const st = existing ? STATUS_META[existing.status] ?? STATUS_META.pending : null;
            return (
              <div
                key={doc.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: 14,
                  borderRadius: 14,
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  flexWrap: 'wrap',
                }}
              >
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
                  <i className="fa-solid fa-file-shield" />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600 }}>
                    {doc.label}
                    {doc.required && <span style={{ color: 'var(--lime2)' }}> *</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {st ? (
                      <span className={`badge ${st.cls}`} style={{ fontSize: 11 }}>
                        {st.label}
                      </span>
                    ) : (
                      <span className="badge" style={{ fontSize: 11, opacity: 0.7 }}>
                        Not uploaded
                      </span>
                    )}
                    {existing?.comment && (
                      <span className="muted" style={{ fontSize: 12 }}>
                        <i className="fa-solid fa-comment-dots" /> {existing.comment}
                      </span>
                    )}
                  </div>
                </div>
                {existing && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={viewing === existing.id}
                    onClick={() => view(existing)}
                  >
                    {viewing === existing.id ? (
                      'Opening…'
                    ) : (
                      <>
                        <i className="fa-solid fa-eye" /> View
                      </>
                    )}
                  </button>
                )}
                <label className="btn btn-lime btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                  {busy === doc.key ? (
                    'Uploading…'
                  ) : (
                    <>
                      <i className="fa-solid fa-upload" /> {existing ? 'Replace' : 'Upload'}
                    </>
                  )}
                  <input
                    type="file"
                    accept={doc.accept}
                    style={{ display: 'none' }}
                    disabled={busy === doc.key}
                    onChange={(e) => {
                      const input = e.currentTarget;
                      const file = input.files?.[0];
                      if (file) upload(doc.key, file);
                      input.value = '';
                    }}
                  />
                </label>
              </div>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Accepted: images or PDF. Documents marked <span style={{ color: 'var(--lime2)' }}>*</span> are required.
        </div>
      </div>
    </div>
  );
}
