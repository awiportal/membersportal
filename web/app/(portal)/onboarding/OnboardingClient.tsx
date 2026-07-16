'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { KYC_DOC_TYPES, RELATION_KINDS, AGREEMENT_TITLE } from '@/lib/onboarding';
import { savePersonalData, continueFromDocuments, saveAgreement, submitForApproval } from './actions';

const ORDER = ['personal', 'documents', 'agreements', 'review'] as const;
const STEP_META: Record<string, { label: string; icon: string }> = {
  personal: { label: 'Personal details', icon: 'fa-user' },
  documents: { label: 'Documents', icon: 'fa-file-arrow-up' },
  agreements: { label: 'Agreements', icon: 'fa-file-contract' },
  review: { label: 'Review & submit', icon: 'fa-clipboard-check' },
};

type Rel = { relation_kind: string; name?: string; relationship?: string; phone?: string; id_number?: string };
type Doc = { doc_type: string; file_path: string; status: string; uploaded_at?: string };

// Submit button whose pending state comes from the actual form status, so it
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
  agreementSigned,
  email,
  requestedStep,
  err,
}: {
  profile: any;
  relations: Rel[];
  docs: Doc[];
  agreementSigned: boolean;
  email: string;
  requestedStep?: string;
  err?: string;
}) {
  const router = useRouter();
  const status = profile?.status;
  const savedStep: string = profile?.onboarding_step || 'personal';

  if (status === 'active') return <ApprovedState />;
  if (savedStep === 'submitted') return <SubmittedState investorId={profile?.investor_id} />;

  // Step is driven by the URL (?step=). We do NOT clamp it back to the saved
  // step — the server actions only ever redirect here after successfully
  // saving, so trusting the URL guarantees the wizard always moves forward.
  // (Skipping ahead via a hand-typed URL is harmless: each advancing action
  // validates its own data server-side, and submit re-checks the whole pack.)
  const savedIdx = Math.max((ORDER as readonly string[]).indexOf(savedStep), 0);
  const reqIdx = requestedStep ? (ORDER as readonly string[]).indexOf(requestedStep) : -1;
  const stepIdx = reqIdx >= 0 ? reqIdx : Math.min(savedIdx, ORDER.length - 1);
  const step = ORDER[stepIdx];
  const maxReach = Math.max(savedIdx, stepIdx);

  const relMap: Record<string, Rel> = {};
  relations.forEach((r) => (relMap[r.relation_kind] = r));

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
      {step === 'agreements' && <AgreementsStep alreadySigned={agreementSigned} />}
      {step === 'review' && <ReviewStep profile={profile} relMap={relMap} docs={docs} agreementSigned={agreementSigned} err={err} />}
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
  // Controlled inputs so values are never lost (React resets uncontrolled
  // forms after a server action; controlled state is immune to that).
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

  const F = ({ label, k, type = 'text', required = false, placeholder = '' }: any) => (
    <div className="field">
      <label>{label} {required && <span style={{ color: 'var(--lime2)' }}>*</span>}</label>
      <input className="input" name={k} type={type} value={f[k as keyof typeof f]} onChange={set(k)} required={required} placeholder={placeholder} />
    </div>
  );

  return (
    <form action={savePersonalData} className="card card-pad">
      <SectionTitle icon="fa-user" title="Your details" desc="These are saved to your member record and used to pre-fill your membership forms." />
      {err === 'save' && <ErrorBanner text="We couldn't save your details just now. Please check your entries and try again — if it keeps happening, let your administrator know." />}
      <div className="grid2">
        <F label="Full name" k="full_name" required placeholder="e.g. Jane Wanjiru" />
        <div className="field"><label>Email</label><input className="input" name="_email" defaultValue={email} readOnly /></div>
      </div>
      <div className="grid2">
        <F label="National ID / Passport number" k="national_id" required />
        <F label="KRA PIN" k="kra_pin" required />
      </div>
      <div className="grid2">
        <F label="Date of birth" k="date_of_birth" type="date" />
        <F label="Phone" k="phone" required placeholder="+254 7XX XXX XXX" />
      </div>
      <div className="grid2">
        <F label="Postal address" k="postal_address" placeholder="e.g. 190-60102" />
        <F label="Physical address" k="physical_address" placeholder="e.g. Nairobi, Kenya" />
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

      <SubmitButton className="btn btn-lime btn-block" style={{ marginTop: 8 }}>
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
function AgreementsStep({ alreadySigned }: { alreadySigned: boolean }) {
  const [agreed, setAgreed] = useState(alreadySigned);
  return (
    <form action={saveAgreement} className="card card-pad">
      <SectionTitle icon="fa-file-contract" title="Membership agreements" desc="Read and accept the membership packet to continue." />
      <div style={{ padding: 16, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 13.5, lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{AGREEMENT_TITLE}</div>
        <p className="muted">
          By joining African Women Investors (AWIVEST) you agree to the Membership Agreement, the Terms &amp; Conditions,
          and the Confidentiality Agreement governing member conduct, contributions, confidentiality of member
          information, and the collective&apos;s investment policies. A full, legally-binding e-signature (with audit
          trail) will be requested via our e-signing partner once your pack is reviewed.
        </p>
      </div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, cursor: 'pointer', fontSize: 14 }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
        <span>I have read and agree to the {AGREEMENT_TITLE}.</span>
      </label>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Link href="/onboarding?step=documents" className="btn btn-ghost"><i className="fa-solid fa-arrow-left" /> Back</Link>
        <SubmitButton className="btn btn-lime btn-block" disabled={!agreed} style={{ flex: 1 }}>
          Agree &amp; continue <i className="fa-solid fa-arrow-right" />
        </SubmitButton>
      </div>
    </form>
  );
}

/* --------------------------- Step 4: Review -------------------------------- */
function ReviewStep({
  profile, relMap, docs, agreementSigned, err,
}: {
  profile: any; relMap: Record<string, Rel>; docs: Doc[]; agreementSigned: boolean; err?: string;
}) {
  const uploaded = new Set(docs.map((d) => d.doc_type));
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
      {err === 'incomplete' && <ErrorBanner text="Some required details or documents are still missing. Please complete every step before submitting." />}

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

      <div style={{ margin: '18px 0 6px', fontWeight: 700, fontSize: 14 }}>Agreements</div>
      <Row k="Membership packet" v={agreementSigned ? 'Accepted' : 'Not accepted'} />

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
