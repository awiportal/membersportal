'use client';

import { useState, useTransition } from 'react';
import { COUNTRIES, COUNTRY_BY_CODE } from '@/lib/countries';
import { updateProfile } from './actions';

function initials(name?: string) {
  const n = (name || '').trim();
  if (!n) return 'AW';
  const parts = n.split(/\s+/);
  return (((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase()) || 'AW';
}

function initialCountryCode(raw?: string | null): string {
  if (!raw) return '';
  if (COUNTRY_BY_CODE[raw]) return raw;
  const lower = String(raw).trim().toLowerCase();
  const hit = COUNTRIES.find((c) => c.name.toLowerCase() === lower);
  return hit ? hit.code : '';
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return String(d);
  }
}

const ROLE_LABEL: Record<string, string> = {
  member: 'Member',
  secretary: 'Secretary',
  admin: 'Administrator',
  superadmin: 'Chairlady',
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ReadRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'right' }} className="num">{value}</span>
    </div>
  );
}

export default function ProfileClient({ profile, accountEmail }: { profile: any; accountEmail: string }) {
  const [fullName, setFullName] = useState<string>(profile?.full_name || '');
  const [phone, setPhone] = useState<string>(profile?.phone || '');
  const [country, setCountry] = useState<string>(initialCountryCode(profile?.country));
  const [physical, setPhysical] = useState<string>(profile?.physical_address || '');
  const [postal, setPostal] = useState<string>(profile?.postal_address || '');
  const [dob, setDob] = useState<string>(profile?.date_of_birth ? String(profile.date_of_birth).slice(0, 10) : '');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();

  const status = String(profile?.status || 'pending');
  const kyc = String(profile?.kyc_status || 'pending');
  const role = String(profile?.role || 'member');
  const memberSince = fmtDate(profile?.joined_at || profile?.created_at);
  const c = country ? COUNTRY_BY_CODE[country] : undefined;

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateProfile({
        full_name: fullName,
        phone,
        country,
        physical_address: physical,
        postal_address: postal,
        date_of_birth: dob,
      });
      if ((res as any)?.error) setMsg({ kind: 'err', text: (res as any).error });
      else setMsg({ kind: 'ok', text: 'Your profile has been saved.' });
    });
  }

  return (
    <div>
      <div className="mb-5">
        <div className="page-title">Profile</div>
        <div className="sub">Manage your personal details and how AWIVEST reaches you.</div>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.55fr)' }} className="profile-grid">
        {/* LEFT: identity + verified details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-pad hover-lift" style={{ textAlign: 'center' }}>
            <div
              className="grad-purple"
              style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 14px', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 30, letterSpacing: 1 }}
            >
              {initials(profile?.full_name)}
            </div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{profile?.full_name || 'AWIVEST member'}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              {profile?.investor_id ? `${profile.investor_id}` : 'Investor ID pending'}
              {c ? ` · ${c.flag} ${c.name}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 14 }}>
              <span className={`badge ${status === 'active' ? 'badge-lime' : ''}`} style={status === 'active' ? {} : { background: 'var(--surface2)', color: 'var(--muted)' }}>
                <i className={`fa-solid ${status === 'active' ? 'fa-circle-check' : 'fa-hourglass-half'}`} /> {status === 'active' ? 'Active' : 'Pending'}
              </span>
              <span className={`badge ${kyc === 'approved' ? 'badge-lime' : ''}`} style={kyc === 'approved' ? {} : { background: 'var(--surface2)', color: 'var(--muted)' }}>
                <i className="fa-solid fa-shield-halved" /> {kyc === 'approved' ? 'KYC verified' : 'KYC ' + kyc}
              </span>
              <span className="badge" style={{ background: 'var(--surface2)', color: 'var(--purple2)' }}>
                <i className="fa-solid fa-user-tie" /> {ROLE_LABEL[role] || 'Member'}
              </span>
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
              <i className="fa-solid fa-id-badge" style={{ color: 'var(--lime2)' }} /> Verified details
            </div>
            <ReadRow label="Investor ID" value={profile?.investor_id || '—'} />
            <ReadRow label="Account email" value={accountEmail || profile?.email || '—'} />
            <ReadRow label="Member since" value={memberSince} />
            {profile?.national_id ? <ReadRow label="National ID / Passport" value={profile.national_id} /> : null}
            {profile?.kra_pin ? <ReadRow label="Tax PIN" value={profile.kra_pin} /> : null}
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
              These verified details and your login email are managed by the AWIVEST office. Please contact the secretariat to update them.
            </div>
          </div>
        </div>

        {/* RIGHT: editable details */}
        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>
            <i className="fa-solid fa-user-pen" style={{ color: 'var(--purple2)' }} /> Member details
          </div>

          {msg ? (
            <div
              className="card-pad"
              style={{
                marginBottom: 14,
                borderRadius: 12,
                fontSize: 13.5,
                fontWeight: 600,
                padding: '11px 14px',
                border: `1px solid ${msg.kind === 'ok' ? 'rgba(166,205,53,0.4)' : 'rgba(239,90,90,0.4)'}`,
                color: msg.kind === 'ok' ? 'var(--lime2)' : '#ef7f7f',
                background: msg.kind === 'ok' ? 'rgba(166,205,53,0.08)' : 'rgba(239,90,90,0.08)',
              }}
            >
              <i className={`fa-solid ${msg.kind === 'ok' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} /> {msg.text}
            </div>
          ) : null}

          <Field label="Full name">
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" autoComplete="name" />
          </Field>

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
            <Field label="Country of residence">
              <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">Select a country…</option>
                {COUNTRIES.map((cc) => (
                  <option key={cc.code} value={cc.code}>
                    {cc.flag} {cc.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Phone" hint="Use international format, e.g. +254 712 345678">
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={c ? `${c.dial} …` : '+254 712 345678'} inputMode="tel" autoComplete="tel" />
            </Field>
          </div>

          <Field label="Physical address" hint="Street, building, city / town">
            <input className="input" value={physical} onChange={(e) => setPhysical(e.target.value)} placeholder="e.g. Karen Plains Arcade, 2nd Floor, Nairobi" />
          </Field>

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
            <Field label="Postal address">
              <input className="input" value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="e.g. P.O. Box 4801-00100" />
            </Field>
            <Field label="Date of birth">
              <input className="input" type="date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} />
            </Field>
          </div>

          <button className="btn btn-primary btn-block mt-2" onClick={save} disabled={pending}>
            {pending ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" /> Saving…
              </>
            ) : (
              <>
                <i className="fa-solid fa-floppy-disk" /> Save changes
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`@media (max-width: 820px){ .profile-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
