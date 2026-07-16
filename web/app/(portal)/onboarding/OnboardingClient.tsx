'use client';

import { useState } from 'react';
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

  // The current step is derived from the URL (?step=) clamped to how far the
  // member has actually progressed (profile.onboarding_step). We deliberately
  // do NOT hold it in useState — otherwise a soft redirect after "Save &
  // continue" would leave the view stuck on the old step until a hard refresh.
  const doneCount = Math.max((ORDER as readonly string[]).indexOf(savedStep), 0);
  const reachableMax = Math.min(doneCount, ORDER.length - 1);
  const reqIdx = requestedStep ? (ORDER as readonly string[]).indexOf(requestedStep) : -1;
  const stepIdx = reqIdx >= 0 && reqIdx <= reachableMax ? reqIdx : reachableMax;
  const step = ORDER[stepIdx];

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
            const done = i < doneCount;
            const isActive = s === step;
            const reachable = i <= reachableMax;
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

      {step === 'personal' && <PersonalStep profile={profile} relMap={relMap} email={email} />}
      {step === 'documents' && <DocumentsStep uid={profile.id} docs={docs} err={err} />}
      {step === 'agreements' && <AgreementsStep alreadySigned={agreementSigned} />}
      {step === 'review' && <ReviewStep profile={profile} relMap={relMap} docs={docs} agreementSigned={agreementSigned} />}
    </div>
  );
}

/* ----------------------------- Step 1: Personal ----------------------------- */
function PersonalStep({ profile, relMap, email }: { profile: any; relMap: Record<string, Rel>; email: string }) {
  const [saving, setSaving] = useState(false);
  const Field = ({ label, name, def, type = 'text', required = false, placeholder = '' }: any) => (
    <div className="field">
      <label>{label} {required && <span style={{ color: 'var(--lime2)' }}>*</span>}</label>
      <input className="input" name={name} type={type} defaultValue={def ?? ''} required={required} placeholder={placeholder} />
    </div>
  );

  return (
    <form action={savePersonalData} onSubmit={() => setSaving(true)} className="card card-pad">
      <SectionTitle icon="fa-user" title="Your details" desc="These are saved to your member record and used to pre-fill your membership forms." />
      <div className="grid2">
        <Field label="Full name" name="full_name" def={profile?.full_name} required placeholder="e.g. Jane Wanjiru" />
        <Field label="Email" name="_email" def={email} />
      </div>
      <div className="grid2">
        <Field label="National ID / Passport number" name="national_id" def={profile?.national_id} required />
        <Field label="KRA PIN" name="kra_pin" def={profile?.kra_pin} required />
      </div>
      <div className="grid2">
        <Field label="Date of birth" name="date_of_birth" def={profile?.date_of_birth} type="date" />
        <Field label="Phone" name="phone" def={profile?.phone} required placeholder="+254 7XX XXX XXX" />
      </div>
      <div className="grid2">
        <Field label="Postal address" name="postal_address" def={profile?.postal_address} placeholder="e.g. 190-60102" />
        <Field label="Physical address" name="physical_address" def={profile?.physical_address} placeholder="e.g. Nairobi, Kenya" />
      </div>

      {RELATION_KINDS.map((rk) => (
        <div key={rk.key} style={{ marginTop: 8 }}>
          <SectionTitle icon="fa-people-roof" title={rk.label} desc={rk.required ? 'Required' : 'Optional'} />
          <div className="grid2">
            <div className="field"><label>Name {rk.required && <span style={{ color: 'var(--lime2)' }}>*</span>}</label>
              <input className="input" name={`${rk.key}_name`} defaultValue={relMap[rk.key]?.name ?? ''} required={rk.required} /></div>
            <div className="field"><label>Relationship</label>
              <input className="input" name={`${rk.key}_relationship`} defaultValue={relMap[rk.key]?.relationship ?? ''} placeholder="e.g. Sister" /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Phone {rk.required && <span style={{ color: 'var(--lime2)' }}>*</span>}</label>
              <input className="input" name={`${rk.key}_phone`} defaultValue={relMap[rk.key]?.phone ?? ''} required={rk.required} /></div>
            <div className="field"><label>ID number</label>
              <input className="input" name={`${rk.key}_id_number`} defaultValue={relMap[rk.key]?.id_number ?? ''} /></div>
          </div>
        </div>
      ))}

      <button className="btn btn-lime btn-block" type="submit" disabled={saving} style={{ marginTop: 8 }}>
        {saving ? 'Saving…' : <>Save &amp; continue <i className="fa-solid fa-arrow-right" /></>}
      </button>
    </form>
  );
}

/* ---------------------------- Step 2: Documents ---------------------------- */
function DocumentsStep({ uid, docs, err }: { uid: string; docs: Doc[]; err?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
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
      {err === 'docs' && (
        <div className="badge badge-bad" style={{ marginBottom: 14 }}>
          <i className="fa-solid fa-circle-exclamation" /> Please upload all three documents before continuing.
        </div>
      )}
      {msg && (
        <div className="badge badge-bad" style={{ marginBottom: 14 }}>
          <i className="fa-solid fa-circle-exclamation" /> {msg}
        </div>
      )}

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
                    const f = e.target.files?.[0];
                    if (f) handleFile(d.key, f);
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
        <form action={continueFromDocuments} onSubmit={() => setAdvancing(true)} style={{ flex: 1 }}>
          <button className="btn btn-lime btn-block" type="submit" disabled={!allUploaded || advancing}>
            {advancing ? 'Saving…' : <>Save &amp; continue <i className="fa-solid fa-arrow-right" /></>}
          </button>
        </form>
      </div>
      {!allUploaded && <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>Upload all three documents to continue.</div>}
    </div>
  );
}

/* --------------------------- Step 3: Agreements ---------------------------- */
function AgreementsStep({ alreadySigned }: { alreadySigned: boolean }) {
  const [agreed, setAgreed] = useState(alreadySigned);
  const [saving, setSaving] = useState(false);
  return (
    <form action={saveAgreement} onSubmit={() => setSaving(true)} className="card card-pad">
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
        <button className="btn btn-lime btn-block" type="submit" disabled={!agreed || saving} style={{ flex: 1 }}>
          {saving ? 'Saving…' : <>Agree &amp; continue <i className="fa-solid fa-arrow-right" /></>}
        </button>
      </div>
    </form>
  );
}

/* --------------------------- Step 4: Review -------------------------------- */
function ReviewStep({
  profile, relMap, docs, agreementSigned,
}: {
  profile: any; relMap: Record<string, Rel>; docs: Doc[]; agreementSigned: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
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

      <form action={submitForApproval} onSubmit={() => setSubmitting(true)} style={{ marginTop: 20 }}>
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : <><i className="fa-solid fa-paper-plane" /> Submit for approval</>}
        </button>
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
