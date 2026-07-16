'use client';

import { useState, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { KYC_DOC_TYPES, RELATION_KINDS } from '@/lib/onboarding';
import { savePersonalData, continueFromDocuments, signAgreement, continueFromAgreements, submitForApproval } from './actions';

const ORDER = ['personal', 'documents', 'agreements', 'review'] as const;
const STEP_META: Record<string, { label: string; icon: string }> = {
  personal: { label: 'Personal details', icon: 'fa-user' },
  documents: { label: 'Documents', icon: 'fa-file-arrow-up' },
  agreements: { label: 'Agreements', icon: 'fa-file-contract' },
  review: { label: 'Review & submit', icon: 'fa-clipboard-check' },
};

type Rel = { relation_kind: string; name?: string; relationship?: string; phone?: string; id_number?: string };
type Doc = { doc_type: string; file_path: string; status: string; uploaded_at?: string };
type Agreement = { id: string; title: string; description?: string | null; required: boolean; fileUrl: string };
type Acceptance = { agreement_id: string; signed_name: string; signed_at: string };

// Submit button whose pending state comes from the real form status, so it
// always resets on completion or error and can never get stuck on "Saving…".
function SubmitButton({
  children,
  pendingText = 'Saving…',
  className = 'btn btn-lime btn-block',
  disabled = false,
  style,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} style={style}>
      {pending ? pendingText : children}
    </button>
  );
}

export default function OnboardingClient({
  profile,
  relations,
  docs,
  agreements,
  acceptances,
  email,
  requestedStep,
  err,
}: {
  profile: any;
  relations: Rel[];
  docs: Doc[];
  agreements: Agreement[];
  acceptances: Acceptance[];
  email: string;
  requestedStep?: string;
  err?: string;
}) {
  const status = profile?.status;
  const savedStep: string = profile?.onboarding_step || 'personal';

  if (status === 'active') return <ApprovedState />;
  if (savedStep === 'submitted') return <SubmittedState investorId={profile?.investor_id} />;

  const router = useRouter();
  const savedIdx = Math.max((ORDER as readonly string[]).indexOf(savedStep), 0);
  const reqIdx = requestedStep ? (ORDER as readonly string[]).indexOf(requestedStep) : -1;
  const stepIdx = reqIdx >= 0 ? reqIdx : Math.min(savedIdx, ORDER.length - 1);
  const step = ORDER[stepIdx];
  const maxReach = Math.max(savedIdx, stepIdx);

  const relMap: Record<string, Rel> = {};
  relations.forEach((r) => (relMap[r.relation_kind] = r));
  const memberName = profile?.full_name || '';

  const goto = (s: string) => router.push(`/onboarding?step=${s}`);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="page-title">Complete your AWIVEST membership</div>
      <div className="sub">Finish the steps below to create your complete membership pack. You can save each step and return to it later.</div>

      {/* Stepper */}
      <div className="card card-pad" style={{ marginTop: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ORDER.map((s, i) => {
            const done = i < savedIdx;
            const isActive = s === step;
            const reachable = i <= maxReach;
            return (
              <button
                key={s}
                type="button"
                onClick={() => reachable && goto(s)}
                className="btn btn-sm"
                style={{
                  flex: '1 1 160px',
                  justifyContent: 'flex-start',
                  cursor: reachable ? 'pointer' : 'default',
                  background: isActive ? 'linear-gradient(135deg,var(--purple2),var(--purple))' : 'var(--surface2)',
                  color: isActive ? '#fff' : reachable ? 'var(--text)' : 'var(--muted2)',
                  border: '1px solid var(--border)',
                  opacity: reachable ? 1 : 0.6,
                }}
              >
                <span
                  style={{
                    width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center',
                    fontSize: 11, fontWeight: 800,
                    background: done ? 'var(--lime)' : isActive ? 'rgba(255,255,255,.25)' : 'var(--surface)',
                    color: done ? '#20260a' : '#fff',
                  }}
                >
                  {done ? <i className="fa-solid fa-check" /> : i + 1}
                </span>
                <i className={`fa-solid ${STEP_META[s].icon}`} style={{ fontSize: 12 }} />
                <span style={{ fontSize: 12.5 }}>{STEP_META[s].label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {step === 'personal' && <PersonalStep profile={profile} relMap={relMap} email={email} err={err} />}
      {step === 'documents' && <DocumentsStep uid={profile.id} docs={docs} err={err} />}
      {step === 'agreements' && <AgreementsStep agreements={agreements} acceptances={acceptances} memberName={memberName} err={err} />}
      {step === 'review' && <ReviewStep profile={profile} relMap={relMap} docs={docs} agreements={agreements} acceptances={acceptances} err={err} />}
    </div>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div className="badge badge-bad" style={{ marginBottom: 14 }}>
      <i className="fa-solid fa-circle-exclamation" /> {text}
    </div>
  );
}

/* ----------------------------- Step 1: Personal ----------------------------- */
function PersonalStep({ profile, relMap, email, err }: { profile: any; relMap: Record<string, Rel>; email: string; err?: string }) {
  const [f, setF] = useState({
    full_name: profile?.full_name ?? '',
    national_id: profile?.national_id ?? '',
    kra_pin: profile?.kra_pin ?? '',
    date_of_birth: profile?.date_of_birth ?? '',
    phone: profile?.phone ?? '',
    postal_address: profile?.postal_address ?? '',
    physical_address: profile?.physical_address ?? '',
  });
  const [rel, setRel] = useState<Record<string, any>>(() => {
    const b: Record<string, any> = {};
    RELATION_KINDS.forEach((rk) => {
      const r = relMap[rk.key] || {};
      b[rk.key] = { name: r.name ?? '', relationship: r.relationship ?? '', phone: r.phone ?? '', id_number: r.id_number ?? '' };
    });
    return b;
  });
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setR = (rk: string, k: string) => (e: any) => setRel((s) => ({ ...s, [rk]: { ...s[rk], [k]: e.target.value } }));

  // Live "already in use" checks for identity fields (National ID + Phone).
  const [dup, setDup] = useState<{ national_id: boolean; phone: boolean }>({ national_id: false, phone: false });
  const [checking, setChecking] = useState<{ national_id: boolean; phone: boolean }>({ national_id: false, phone: false });
  const timers = useRef<Record<string, any>>({});

  async function checkUnique(field: 'national_id' | 'phone', value: string) {
    const v = value.trim();
    if (!v || v === String(profile?.[field] ?? '').trim()) {
      setChecking((s) => ({ ...s, [field]: false }));
      setDup((s) => ({ ...s, [field]: false }));
      return;
    }
    try {
      setChecking((s) => ({ ...s, [field]: true }));
      const supabase = createClient();
      const { data } = await supabase.rpc('identifier_in_use', { p_field: field, p_value: v });
      setDup((s) => ({ ...s, [field]: data === true }));
    } catch {
      setDup((s) => ({ ...s, [field]: false }));
    } finally {
      setChecking((s) => ({ ...s, [field]: false }));
    }
  }

  const onIdentity = (field: 'national_id' | 'phone') => (e: any) => {
    const value = e.target.value;
    setF((s) => ({ ...s, [field]: value }));
    setDup((s) => ({ ...s, [field]: false }));
    clearTimeout(timers.current[field]);
    timers.current[field] = setTimeout(() => checkUnique(field, value), 500);
  };
  const dupAny = dup.national_id || dup.phone;

  return (
    <form action={savePersonalData} className="card card-pad">
      <SectionTitle icon="fa-user" title="Your details" desc="These are saved to your member record and used to pre-fill your membership forms." />
      {err === 'save' && <ErrorBanner text="We couldn't save your details just now. Please check your entries and try again — if it keeps happening, let your administrator know." />}
      {err === 'dup_national_id' && <ErrorBanner text="That National ID / Passport number is already registered to another member. Each person may hold only one AWIVEST membership." />}
      {err === 'dup_phone' && <ErrorBanner text="That phone number is already registered to another member. Please use a different number." />}
      {err === 'dup' && <ErrorBanner text="Some of your details are already registered to another member. Please review the highlighted fields." />}
      <div className="grid2">
        <div className="field">
          <label>Full name <span style={{ color: 'var(--lime2)' }}>*</span></label>
          <input className="input" name="full_name" value={f.full_name} onChange={set('full_name')} required placeholder="e.g. Jane Wanjiru" />
        </div>
        <div className="field"><label>Email</label><input className="input" name="_email" defaultValue={email} readOnly /></div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>National ID / Passport number <span style={{ color: 'var(--lime2)' }}>*</span></label>
          <input className="input" name="national_id" value={f.national_id} onChange={onIdentity('national_id')} required style={dup.national_id ? { borderColor: '#ff8a8a' } : undefined} />
          {checking.national_id && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Checking…</div>}
          {dup.national_id && <div style={{ color: '#ff8a8a', fontSize: 12, marginTop: 4 }}><i className="fa-solid fa-circle-exclamation" /> This ID number is already in use by another member.</div>}
        </div>
        <div className="field">
          <label>KRA PIN <span style={{ color: 'var(--lime2)' }}>*</span></label>
          <input className="input" name="kra_pin" value={f.kra_pin} onChange={set('kra_pin')} required />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Date of birth</label>
          <input className="input" name="date_of_birth" type="date" value={f.date_of_birth} onChange={set('date_of_birth')} />
        </div>
        <div className="field">
          <label>Phone <span style={{ color: 'var(--lime2)' }}>*</span></label>
          <input className="input" name="phone" value={f.phone} onChange={onIdentity('phone')} required placeholder="+254 7XX XXX XXX" style={dup.phone ? { borderColor: '#ff8a8a' } : undefined} />
          {checking.phone && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Checking…</div>}
          {dup.phone && <div style={{ color: '#ff8a8a', fontSize: 12, marginTop: 4 }}><i className="fa-solid fa-circle-exclamation" /> This phone number is already in use by another member.</div>}
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Postal address</label>
          <input className="input" name="postal_address" value={f.postal_address} onChange={set('postal_address')} placeholder="e.g. 190-60102" />
        </div>
        <div className="field">
          <label>Physical address</label>
          <input className="input" name="physical_address" value={f.physical_address} onChange={set('physical_address')} placeholder="e.g. Nairobi, Kenya" />
        </div>
      </div>

      {RELATION_KINDS.map((rk) => (
        <div key={rk.key} style={{ marginTop: 8 }}>
          <SectionTitle icon="fa-people-roof" title={rk.label} desc={rk.required ? 'Required' : 'Optional'} />
          <div className="grid2">
            <div className="field"><label>Name {rk.required && <span style={{ color: 'var(--lime2)' }}>*</span>}</label>
              <input className="input" name={`${rk.key}_name`} value={rel[rk.key].name} onChange={setR(rk.key, 'name')} required={rk.required} /></div>
            <div className="field"><label>Relationship</label>
              <input className="input" name={`${rk.key}_relationship`} value={rel[rk.key].relationship} onChange={setR(rk.key, 'relationship')} placeholder="e.g. Sister" /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Phone {rk.required && <span style={{ color: 'var(--lime2)' }}>*</span>}</label>
              <input className="input" name={`${rk.key}_phone`} value={rel[rk.key].phone} onChange={setR(rk.key, 'phone')} required={rk.required} /></div>
            <div className="field"><label>ID number</label>
              <input className="input" name={`${rk.key}_id_number`} value={rel[rk.key].id_number} onChange={setR(rk.key, 'id_number')} /></div>
          </div>
        </div>
      ))}

      {dupAny && <div style={{ color: '#ff8a8a', fontSize: 12.5, textAlign: 'center', marginTop: 10 }}>Please resolve the highlighted duplicate(s) before continuing.</div>}
      <SubmitButton className="btn btn-lime btn-block" style={{ marginTop: 8 }} disabled={dupAny}>
        Save &amp; continue <i className="fa-solid fa-arrow-right" />
      </SubmitButton>
    </form>
  );
}

/* ---------------------------- Step 2: Documents ---------------------------- */
function DocumentsStep({ uid, docs, err }: { uid: string; docs: Doc[]; err?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const uploaded = new Set(docs.map((d) => d.doc_type));
  const allUploaded = KYC_DOC_TYPES.every((d) => uploaded.has(d.key));

  async function handleFile(docKey: string, file: File) {
    setMsg(null);
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
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message || 'Upload failed. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card card-pad">
      <SectionTitle icon="fa-file-arrow-up" title="Upload your documents" desc="One at a time. Allowed: PDF, JPG, PNG. Max 25MB each." />
      {err === 'docs' && <ErrorBanner text="Please upload all three documents before continuing." />}
      {msg && <ErrorBanner text={msg} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {KYC_DOC_TYPES.map((d) => {
          const isUp = uploaded.has(d.key);
          const isBusy = busy === d.key;
          return (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: isUp ? 'rgba(55,201,138,0.16)' : 'var(--surface)', color: isUp ? '#7ef0bf' : 'var(--muted2)' }}>
                <i className={`fa-solid ${isUp ? 'fa-circle-check' : 'fa-file'}`} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{d.label}</div>
                <div className={isUp ? 'badge badge-good' : 'muted'} style={{ fontSize: 12, marginTop: 4, display: 'inline-flex' }}>
                  {isUp ? 'Uploaded' : 'Not uploaded'}
                </div>
              </div>
              <label className="btn btn-ghost btn-sm" style={{ cursor: isBusy ? 'default' : 'pointer' }}>
                {isBusy ? 'Uploading…' : isUp ? 'Replace' : 'Upload'}
                <input
                  type="file"
                  accept={d.accept}
                  style={{ display: 'none' }}
                  disabled={isBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(d.key, file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Link href="/onboarding?step=personal" className="btn btn-ghost"><i className="fa-solid fa-arrow-left" /> Back</Link>
        <form action={continueFromDocuments} style={{ flex: 1 }}>
          <SubmitButton className="btn btn-lime btn-block" disabled={!allUploaded}>
            Save &amp; continue <i className="fa-solid fa-arrow-right" />
          </SubmitButton>
        </form>
      </div>
      {!allUploaded && <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>Upload all three documents to continue.</div>}
    </div>
  );
}

/* --------------------------- Step 3: Agreements ---------------------------- */
function AgreementsStep({ agreements, acceptances, memberName, err }: { agreements: Agreement[]; acceptances: Acceptance[]; memberName: string; err?: string }) {
  const accByAgr: Record<string, Acceptance> = {};
  acceptances.forEach((a) => (accByAgr[a.agreement_id] = a));
  const requiredUnsigned = agreements.filter((a) => a.required && !accByAgr[a.id]);
  const canContinue = requiredUnsigned.length === 0;

  return (
    <div className="card card-pad">
      <SectionTitle icon="fa-file-contract" title="Membership agreements" desc="Open each document to read it, then sign by typing your full name." />
      {err === 'agreements' && <ErrorBanner text="Please sign all required agreements before continuing." />}
      {err === 'sign' && <ErrorBanner text="Please type your full name to sign." />}

      {agreements.length === 0 ? (
        <div className="muted" style={{ padding: 16, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 13.5 }}>
          No agreement documents have been published yet, so there is nothing to sign right now. You can continue.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {agreements.map((a) => {
            const acc = accByAgr[a.id];
            return (
              <div key={a.id} style={{ padding: 14, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: acc ? 'rgba(55,201,138,0.16)' : 'var(--surface)', color: acc ? '#7ef0bf' : 'var(--purple2)' }}>
                    <i className={`fa-solid ${acc ? 'fa-circle-check' : 'fa-file-contract'}`} />
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {a.title} {a.required ? <span style={{ color: 'var(--lime2)' }}>*</span> : <span className="muted" style={{ fontSize: 12 }}>(optional)</span>}
                    </div>
                    {a.description && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{a.description}</div>}
                  </div>
                  <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm"><i className="fa-solid fa-up-right-from-square" /> Read</a>
                </div>

                {acc ? (
                  <div className="badge badge-good" style={{ marginTop: 12 }}>
                    <i className="fa-solid fa-signature" /> Signed by {acc.signed_name} on {new Date(acc.signed_at).toLocaleDateString()}
                  </div>
                ) : (
                  <form action={signAgreement} style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <input type="hidden" name="agreement_id" value={a.id} />
                    <div className="field" style={{ flex: '1 1 240px', margin: 0 }}>
                      <label>Type your full name to sign</label>
                      <input className="input" name="signed_name" defaultValue={memberName} placeholder="e.g. Jane Wanjiru" required />
                    </div>
                    <SubmitButton className="btn btn-lime" pendingText="Signing…" style={{ whiteSpace: 'nowrap' }}>
                      <i className="fa-solid fa-pen-nib" /> Sign
                    </SubmitButton>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Link href="/onboarding?step=documents" className="btn btn-ghost"><i className="fa-solid fa-arrow-left" /> Back</Link>
        <form action={continueFromAgreements} style={{ flex: 1 }}>
          <SubmitButton className="btn btn-lime btn-block" disabled={!canContinue}>
            Save &amp; continue <i className="fa-solid fa-arrow-right" />
          </SubmitButton>
        </form>
      </div>
      {!canContinue && <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>Sign all required agreements to continue.</div>}
    </div>
  );
}

/* --------------------------- Step 4: Review -------------------------------- */
function ReviewStep({
  profile, relMap, docs, agreements, acceptances, err,
}: {
  profile: any; relMap: Record<string, Rel>; docs: Doc[]; agreements: Agreement[]; acceptances: Acceptance[]; err?: string;
}) {
  const uploaded = new Set(docs.map((d) => d.doc_type));
  const signed = new Set(acceptances.map((a) => a.agreement_id));
  const Row = ({ k, v }: { k: string; v: any }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5 }}>
      <span className="muted">{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{v || '—'}</span>
    </div>
  );
  const rel = (k: string) => {
    const r = relMap[k];
    if (!r || !r.name) return '—';
    return `${r.name}${r.relationship ? ` (${r.relationship})` : ''}${r.phone ? ` · ${r.phone}` : ''}`;
  };

  return (
    <div className="card card-pad">
      <SectionTitle icon="fa-clipboard-check" title="Review & submit" desc="Please review your information. If everything is correct, submit your pack for committee approval." />
      {err === 'incomplete' && <ErrorBanner text="Some required details, documents or signatures are still missing. Please complete every step before submitting." />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Personal details</div>
        <Link href="/onboarding?step=personal" className="btn btn-ghost btn-sm">Edit</Link>
      </div>
      <Row k="Full name" v={profile?.full_name} />
      <Row k="ID / Passport no." v={profile?.national_id} />
      <Row k="KRA PIN" v={profile?.kra_pin} />
      <Row k="Date of birth" v={profile?.date_of_birth} />
      <Row k="Phone" v={profile?.phone} />
      <Row k="Postal address" v={profile?.postal_address} />
      <Row k="Physical address" v={profile?.physical_address} />
      <Row k="Next of kin" v={rel('next_of_kin')} />
      <Row k="Beneficiary" v={rel('beneficiary')} />
      <Row k="Nominee" v={rel('nominee')} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 6px' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Documents</div>
        <Link href="/onboarding?step=documents" className="btn btn-ghost btn-sm">Edit</Link>
      </div>
      {KYC_DOC_TYPES.map((d) => (
        <Row key={d.key} k={d.label} v={uploaded.has(d.key) ? 'Uploaded' : 'Missing'} />
      ))}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 6px' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Agreements</div>
        <Link href="/onboarding?step=agreements" className="btn btn-ghost btn-sm">Edit</Link>
      </div>
      {agreements.length === 0 ? (
        <Row k="Agreements" v="None to sign" />
      ) : (
        agreements.map((a) => (
          <Row key={a.id} k={a.title} v={signed.has(a.id) ? 'Signed' : a.required ? 'Not signed' : 'Optional — not signed'} />
        ))
      )}

      <form action={submitForApproval} style={{ marginTop: 20 }}>
        <SubmitButton className="btn btn-primary btn-block" pendingText="Submitting…">
          <i className="fa-solid fa-paper-plane" /> Submit for approval
        </SubmitButton>
      </form>
      <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>
        Your pack goes to the AWIVEST committee. You&apos;ll be notified once it&apos;s reviewed.
      </div>
    </div>
  );
}

/* ------------------------------ Shared bits -------------------------------- */
function SectionTitle({ icon, title, desc }: { icon: string; title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 16 }}>
        <span className="grad-lime" style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', color: '#20260a' }}>
          <i className={`fa-solid ${icon}`} style={{ fontSize: 13 }} />
        </span>
        {title}
      </div>
      {desc && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{desc}</div>}
    </div>
  );
}

function SubmittedState({ investorId }: { investorId?: string }) {
  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <div className="card card-pad" style={{ textAlign: 'center', padding: '56px 24px' }}>
        <div className="grad-purple" style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 18px', display: 'grid', placeItems: 'center', color: '#fff' }}>
          <i className="fa-solid fa-hourglass-half" style={{ fontSize: 28 }} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 20 }}>Submitted for approval</div>
        <p className="muted" style={{ fontSize: 14, maxWidth: 460, margin: '10px auto 18px', lineHeight: 1.6 }}>
          Thank you. Your complete membership pack has been submitted to the AWIVEST committee for approval.
          You will receive an email once it has been reviewed, and your full portal will unlock automatically.
        </p>
        <div className="badge badge-warn"><i className="fa-solid fa-clock" /> Pending committee approval</div>
        <div style={{ marginTop: 22 }}>
          <Link href="/dashboard" className="btn btn-ghost">Back to dashboard</Link>
        </div>
      </div>
    </div>
  );
}

function ApprovedState() {
  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <div className="card card-pad" style={{ textAlign: 'center', padding: '56px 24px' }}>
        <div className="grad-lime" style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 18px', display: 'grid', placeItems: 'center', color: '#20260a' }}>
          <i className="fa-solid fa-circle-check" style={{ fontSize: 28 }} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 20 }}>You&apos;re an active member</div>
        <p className="muted" style={{ fontSize: 14, maxWidth: 460, margin: '10px auto 18px', lineHeight: 1.6 }}>
          Your membership is approved and all portal features are unlocked.
        </p>
        <Link href="/dashboard" className="btn btn-lime">Go to dashboard <i className="fa-solid fa-arrow-right" /></Link>
      </div>
    </div>
  );
}
