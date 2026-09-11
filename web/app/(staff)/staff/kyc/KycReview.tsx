'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  reviewed_at?: string | null;
};
type Member = {
  id: string;
  full_name: string | null;
  investor_id: string | null;
  member_type: string | null;
  kyc_status: string | null;
  avatar_url?: string | null;
  email?: string | null;
};
type Group = { member: Member; docs: Doc[]; anyPending: boolean };
type Filter = 'all' | 'pending' | 'approved' | 'rejected';

const STATUS_CLS: Record<string, string> = { approved: 'badge-good', pending: 'badge-info', rejected: 'badge-bad' };
const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'svg']);

function cap(s: string | null | undefined) {
  return s ? s[0].toUpperCase() + s.slice(1) : 'Pending';
}
function initials(name: string | null) {
  const n = (name || '').trim();
  if (!n) return '?';
  return n.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
}
function fmtDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function docIcon(t: string) {
  const k = (t || '').toLowerCase();
  if (k.includes('photo')) return 'fa-image';
  if (k.includes('passport')) return 'fa-passport';
  if (k.includes('pin')) return 'fa-file-invoice';
  if (k.includes('id')) return 'fa-id-card';
  if (k.includes('incorp') || k.includes('certificate')) return 'fa-building-columns';
  if (k.includes('registration') || k.includes('cr12') || k.includes('company')) return 'fa-building';
  if (k.includes('resolution') || k.includes('minutes')) return 'fa-file-signature';
  if (k.includes('constitution')) return 'fa-scroll';
  return 'fa-file-lines';
}
function humanize(t: string) {
  const map: Record<string, string> = { kra_pin: 'KRA PIN', national_id: 'National ID' };
  if (map[t]) return map[t];
  return (t || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function KycReview({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const [preview, setPreview] = useState<{ docId: string; label: string; member: string; status: string } | null>(null);
  const [pv, setPv] = useState<{ url?: string; ext?: string; error?: string; loading: boolean }>({ loading: false });

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closePreview();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  const counts = {
    total: groups.length,
    awaiting: groups.filter((g) => g.anyPending).length,
    approved: groups.filter((g) => (g.member.kyc_status || 'pending') === 'approved').length,
    rejected: groups.filter((g) => (g.member.kyc_status || 'pending') === 'rejected').length,
  };

  const q = query.trim().toLowerCase();
  const visible = groups.filter((g) => {
    const status = g.member.kyc_status || 'pending';
    if (filter === 'pending' && !g.anyPending) return false;
    if (filter === 'approved' && status !== 'approved') return false;
    if (filter === 'rejected' && status !== 'rejected') return false;
    if (q) {
      const hay = `${g.member.full_name || ''} ${g.member.investor_id || ''} ${g.member.email || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  function closePreview() {
    setPreview(null);
    setPv({ loading: false });
  }

  async function openPreview(d: Doc, memberName: string, label: string) {
    setPreview({ docId: d.id, label, member: memberName, status: d.status });
    setPv({ loading: true });
    const res = await getKycDocUrl(d.id);
    if (res?.url) setPv({ url: res.url, ext: res.ext, loading: false });
    else setPv({ error: res?.error || 'Could not open the file.', loading: false });
  }

  async function decide(id: string, decision: 'approved' | 'rejected', closeAfter?: boolean) {
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
      setRejecting((r) => {
        const n = { ...r };
        delete n[id];
        return n;
      });
      if (closeAfter) closePreview();
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

  const TILES: { id: Filter; label: string; value: number; icon: string; accent: string }[] = [
    { id: 'pending', label: 'Awaiting review', value: counts.awaiting, icon: 'fa-hourglass-half', accent: 'var(--lime2)' },
    { id: 'approved', label: 'Verified', value: counts.approved, icon: 'fa-circle-check', accent: 'var(--good)' },
    { id: 'rejected', label: 'Rejected', value: counts.rejected, icon: 'fa-circle-xmark', accent: 'var(--bad)' },
    { id: 'all', label: 'All members', value: counts.total, icon: 'fa-users', accent: 'var(--purple2)' },
  ];

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <div className="page-title">KYC review</div>
      <div className="sub">Verify members&apos; identity documents, preview each file inline, and record a decision. Members with documents awaiting review are shown first.</div>

      {/* Summary tiles double as filters */}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', margin: '20px 0 16px' }}>
        {TILES.map((t) => {
          const active = filter === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className="card hover-lift"
              style={{
                textAlign: 'left',
                padding: 16,
                cursor: 'pointer',
                border: active ? `1px solid ${t.accent}` : '1px solid var(--border)',
                boxShadow: active ? `inset 0 0 0 1px ${t.accent}` : undefined,
                background: 'var(--surface)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: 12.5 }}>{t.label}</span>
                <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--surface2)', color: t.accent }}>
                  <i className={`fa-solid ${t.icon}`} style={{ fontSize: 13 }} />
                </span>
              </div>
              <div className="num" style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{t.value}</div>
            </button>
          );
        })}
      </div>

      {/* Search + active-filter chip */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <i className="fa-solid fa-magnifying-glass muted" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12.5 }} />
          <input
            className="input"
            style={{ paddingLeft: 32, width: '100%' }}
            placeholder="Search by name or registration no."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {filter !== 'all' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter('all')}>
            <i className="fa-solid fa-xmark" /> Clear filter
          </button>
        )}
      </div>

      {msg && (
        <div className="badge badge-bad" style={{ marginBottom: 16, padding: '10px 14px', fontSize: 13 }}>
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--surface2)', color: 'var(--muted)', margin: '0 auto 12px' }}>
            <i className="fa-solid fa-inbox" style={{ fontSize: 20 }} />
          </div>
          <div style={{ fontWeight: 700 }}>{groups.length === 0 ? 'No KYC documents uploaded yet' : 'Nothing matches this view'}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {groups.length === 0 ? 'Documents appear here as members complete onboarding.' : 'Try a different filter or clear your search.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {visible.map(({ member, docs }) => {
            const labels = new Map(docsFor(member.member_type).map((d) => [d.key, d.label]));
            const status = member.kyc_status || 'pending';
            const approved = docs.filter((d) => d.status === 'approved').length;
            const pct = docs.length ? Math.round((approved / docs.length) * 100) : 0;
            const accent = status === 'approved' ? 'var(--good)' : status === 'rejected' ? 'var(--bad)' : 'var(--lime2)';
            return (
              <div key={member.id} className="card" style={{ padding: 0, overflow: 'hidden', borderLeft: `3px solid ${accent}` }}>
                {/* Member header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap', padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
                  {member.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={member.avatar_url} alt="" className="avatar" style={{ objectFit: 'cover', padding: 0 }} />
                  ) : (
                    <div className="avatar" style={{ background: 'var(--surface2)', color: 'var(--text)' }}>{initials(member.full_name)}</div>
                  )}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 700 }}>{member.full_name || 'Unnamed member'}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {member.investor_id || '—'} · <span style={{ textTransform: 'capitalize' }}>{member.member_type || 'individual'}</span>
                    </div>
                  </div>
                  <div style={{ minWidth: 150 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span className="muted">{approved}/{docs.length} approved</span>
                      <span className="muted">{pct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: 'var(--surface2)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: accent, transition: 'width .3s' }} />
                    </div>
                  </div>
                  <span className={`badge ${STATUS_CLS[status] || 'badge-info'}`}>{cap(status)}</span>
                </div>

                {/* Documents */}
                <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {docs.map((d) => {
                    const label = labels.get(d.doc_type) || humanize(d.doc_type);
                    const isRejecting = !!rejecting[d.id];
                    return (
                      <div key={d.id} style={{ padding: 12, borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: 'var(--purple2)', flexShrink: 0 }}>
                            <i className={`fa-solid ${docIcon(d.doc_type)}`} />
                          </span>
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <div style={{ fontWeight: 600 }}>{label}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                              <span className={`badge ${STATUS_CLS[d.status] || 'badge-info'}`} style={{ fontSize: 10.5 }}>{cap(d.status)}</span>
                              {d.uploaded_at && <span className="muted" style={{ fontSize: 11 }}>Uploaded {fmtDate(d.uploaded_at)}</span>}
                            </div>
                          </div>
                          <button type="button" className="btn btn-ghost btn-sm" disabled={busy === 'view:' + d.id} onClick={() => openPreview(d, member.full_name || 'Member', label)}>
                            <i className="fa-solid fa-eye" /> Preview
                          </button>
                          <button type="button" className="btn btn-lime btn-sm" disabled={busy === 'approved:' + d.id} onClick={() => decide(d.id, 'approved')}>
                            <i className="fa-solid fa-check" /> Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: '#ef5a5a' }}
                            onClick={() => setRejecting((r) => ({ ...r, [d.id]: !r[d.id] }))}
                          >
                            <i className="fa-solid fa-xmark" /> Reject
                          </button>
                        </div>

                        {isRejecting ? (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                            <input
                              className="input"
                              placeholder="Reason shown to the member (optional)"
                              value={comments[d.id] ?? d.comment ?? ''}
                              onChange={(e) => setComments((c) => ({ ...c, [d.id]: e.target.value }))}
                            />
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button type="button" className="btn btn-sm" style={{ background: '#ef5a5a', color: '#fff', border: 0 }} disabled={busy === 'rejected:' + d.id} onClick={() => decide(d.id, 'rejected')}>
                                <i className="fa-solid fa-ban" /> Confirm rejection
                              </button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRejecting((r) => ({ ...r, [d.id]: false }))}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          d.comment && d.status === 'rejected' && (
                            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                              <i className="fa-solid fa-comment-dots" /> {d.comment}
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Overall verification */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
                  <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>Overall verification</span>
                  <button type="button" className="btn btn-lime btn-sm" disabled={busy === 'm:' + member.id + 'approved' || status === 'approved'} onClick={() => setStatus(member.id, 'approved')}>
                    <i className="fa-solid fa-user-check" /> Mark verified
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#ef5a5a' }} disabled={busy === 'm:' + member.id + 'rejected' || status === 'rejected'} onClick={() => setStatus(member.id, 'rejected')}>
                    <i className="fa-solid fa-user-xmark" /> Mark rejected
                  </button>
                  {status !== 'pending' && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy === 'm:' + member.id + 'pending'} onClick={() => setStatus(member.id, 'pending')}>
                      <i className="fa-solid fa-rotate-left" /> Reset to pending
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview drawer */}
      {mounted && preview && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={closePreview}
          style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(560px, 94vw)', height: '100%', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-24px 0 60px -20px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{preview.label}</div>
                <div className="muted" style={{ fontSize: 12 }}>{preview.member}</div>
              </div>
              <span className={`badge ${STATUS_CLS[preview.status] || 'badge-info'}`}>{cap(preview.status)}</span>
              <button type="button" className="icon-btn" style={{ width: 34, height: 34 }} onClick={closePreview} aria-label="Close">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: 18, background: 'var(--surface2)' }}>
              {pv.loading ? (
                <div className="muted" style={{ textAlign: 'center', padding: 40, fontSize: 13 }}>
                  <i className="fa-solid fa-spinner fa-spin" /> Loading document…
                </div>
              ) : pv.error ? (
                <div className="badge badge-bad" style={{ padding: '10px 14px', fontSize: 13 }}>
                  <i className="fa-solid fa-circle-exclamation" /> {pv.error}
                </div>
              ) : pv.url && pv.ext && IMG_EXT.has(pv.ext) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pv.url} alt={preview.label} style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)', background: '#fff' }} />
              ) : pv.url && pv.ext === 'pdf' ? (
                <iframe title="document" src={pv.url} style={{ width: '100%', height: '70vh', border: '1px solid var(--border)', borderRadius: 10, background: '#fff' }} />
              ) : pv.url ? (
                <div style={{ textAlign: 'center', padding: 30 }}>
                  <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>This file type can&apos;t be shown inline.</div>
                  <a className="btn btn-ghost btn-sm" href={pv.url} target="_blank" rel="noopener noreferrer"><i className="fa-solid fa-arrow-up-right-from-square" /> Open in a new tab</a>
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '14px 18px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              {pv.url && (
                <a className="btn btn-ghost btn-sm" href={pv.url} target="_blank" rel="noopener noreferrer"><i className="fa-solid fa-arrow-up-right-from-square" /> Open</a>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-lime btn-sm" disabled={busy === 'approved:' + preview.docId} onClick={() => decide(preview.docId, 'approved', true)}>
                  <i className="fa-solid fa-check" /> Approve
                </button>
                <button type="button" className="btn btn-sm" style={{ background: '#ef5a5a', color: '#fff', border: 0 }} disabled={busy === 'rejected:' + preview.docId} onClick={() => decide(preview.docId, 'rejected', true)}>
                  <i className="fa-solid fa-xmark" /> Reject
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
