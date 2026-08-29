"use client";

import { useState } from 'react';
import { getDocumentDownloadUrl } from './actions';

type Doc = {
  id: string;
  title: string;
  type: string;
  member_id: string | null;
  created_at: string;
};

const TYPE_META: Record<string, { label: string; icon: string }> = {
  statement: { label: 'Statement', icon: 'fa-file-invoice-dollar' },
  report: { label: 'Report', icon: 'fa-file-lines' },
  certificate: { label: 'Certificate', icon: 'fa-award' },
  welfare_statement: { label: 'Welfare statement', icon: 'fa-hand-holding-heart' },
  guide: { label: 'Guide', icon: 'fa-book-open' },
  policy: { label: 'Policy', icon: 'fa-file-shield' },
  onboarding: { label: 'Onboarding', icon: 'fa-user-plus' },
  other: { label: 'Document', icon: 'fa-file' },
};

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function DocumentsClient({ docs, uid }: { docs: Doc[]; uid: string }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function open(id: string) {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await getDocumentDownloadUrl(id);
      if (res?.error || \!res?.url) {
        setMsg(res?.error || 'Could not open this document. Please try again.');
        return;
      }
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch {
      setMsg('Could not open this document. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="page-title">Document Centre</div>
      <div className="sub">
        Statements, certificates, policies and guides AWIVEST has shared with you — plus any documents prepared for your
        account. Files open through a secure, short-lived link.
      </div>

      {msg && (
        <div className="badge badge-bad" style={{ marginTop: 16 }}>
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}

      {docs.length === 0 ? (
        <div className="card card-pad" style={{ marginTop: 24, textAlign: 'center', padding: '56px 24px' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              margin: '0 auto 16px',
              display: 'grid',
              placeItems: 'center',
              background: 'var(--surface2)',
            }}
          >
            <i className="fa-solid fa-folder-open" style={{ fontSize: 24, color: 'var(--lime2)' }} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>No documents yet</div>
          <p className="muted" style={{ fontSize: 13, maxWidth: 420, margin: '8px auto 0', lineHeight: 1.55 }}>
            When AWIVEST publishes statements, certificates or policies, they will appear here for you to open securely.
          </p>
        </div>
      ) : (
        <div className="card card-pad" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {docs.map((d) => {
              const meta = TYPE_META[d.type] ?? TYPE_META.other;
              const personal = d.member_id === uid;
              return (
                <div
                  key={d.id}
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
                    <i className={`fa-solid ${meta.icon}`} />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600 }}>{d.title}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="badge badge-info" style={{ fontSize: 11 }}>
                        {meta.label}
                      </span>
                      <span className={`badge ${personal ? 'badge-purple' : 'badge-good'}`} style={{ fontSize: 11 }}>
                        {personal ? 'For you' : 'All members'}
                      </span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {fmtDate(d.created_at)}
                      </span>
                    </div>
                  </div>
                  <button
                    className="btn btn-lime btn-sm"
                    type="button"
                    disabled={busyId === d.id}
                    onClick={() => open(d.id)}
                  >
                    {busyId === d.id ? (
                      'Opening…'
                    ) : (
                      <>
                        <i className="fa-solid fa-arrow-up-right-from-square" /> Open
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
