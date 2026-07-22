'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { COUNTRIES } from '@/lib/countries';

type MemberType = 'individual' | 'group' | 'corporate' | 'other';

// Dial-code options for the international phone selector. Built from the shared
// country list; de-labelled to "{flag} {dial}" and ordered by numeric dial code.
const DIAL_OPTIONS = COUNTRIES
  .filter((c) => c.dial)
  .map((c) => ({ key: c.code, flag: c.flag, dial: c.dial }))
  .sort((a, b) => Number(a.dial.replace(/\D/g, '')) - Number(b.dial.replace(/\D/g, '')));

export default function LoginForm() {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Shared
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  // Registration
  const [memberType, setMemberType] = useState<MemberType>('individual');
  const [fullName, setFullName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [country, setCountry] = useState('Kenya');
  const [dialCode, setDialCode] = useState('+254');
  const [phone, setPhone] = useState('');

  // Email-code confirmation
  const [otp, setOtp] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);

  const [msg, setMsg] = useState<{ t: string; kind: 'bad' | 'good' } | null>(null);
  const [loading, setLoading] = useState(false);

  const isOrg = memberType === 'group' || memberType === 'corporate';
  const nameLabel =
    memberType === 'group' ? 'Group name'
      : memberType === 'corporate' ? 'Company / Institution name'
        : memberType === 'other' ? 'Name'
          : 'Full name';
  const namePlaceholder =
    memberType === 'group' ? 'e.g. Umoja Women Investment Group'
      : memberType === 'corporate' ? 'e.g. Sunrise Capital Ltd'
        : memberType === 'other' ? 'Name'
          : 'e.g. Jane Wanjiru';

  function onCountryChange(name: string) {
    setCountry(name);
    const c = COUNTRIES.find((x) => x.name === name);
    if (c && c.dial) setDialCode(c.dial);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ t: error.message, kind: 'bad' });
      else {
        router.push('/dashboard');
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone ? `${dialCode} ${phone}`.trim() : '',
            dial_code: dialCode,
            country,
            member_type: memberType,
            contact_person: isOrg ? contactPerson : '',
            contact_role: isOrg ? contactRole : '',
          },
        },
      });
      if (error) {
        const lm = (error.message || '').toLowerCase();
        const friendly =
          lm.includes('already') || lm.includes('registered') || lm.includes('exists')
            ? 'That email address is already in use. Please sign in instead, or use a different email.'
            : error.message;
        setMsg({ t: friendly, kind: 'bad' });
      } else if (data.session) {
        // Email confirmation is switched off — straight into the portal.
        router.push('/dashboard');
        router.refresh();
      } else {
        // Email confirmation is on: collect the 6-digit code on this screen
        // instead of asking the member to click a link in their inbox.
        setAwaitingCode(true);
        setMsg({ t: 'We’ve emailed you a 6-digit code. Enter it below to finish creating your account.', kind: 'good' });
      }
    }
    setLoading(false);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const token = otp.replace(/\D/g, '').slice(0, 6);
    if (token.length < 6) {
      setMsg({ t: 'Please enter the 6-digit code from your email.', kind: 'bad' });
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) {
      setMsg({ t: 'That code was not correct or has expired. Check the latest email, or tap “Resend code”.', kind: 'bad' });
    } else if (data.session) {
      router.push('/dashboard');
      router.refresh();
    } else {
      setMsg({ t: 'Email confirmed. Please sign in.', kind: 'good' });
      setAwaitingCode(false);
      setMode('login');
    }
    setLoading(false);
  }

  async function resendCode() {
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) setMsg({ t: 'We could not resend the code just now. Please wait a moment and try again.', kind: 'bad' });
    else setMsg({ t: 'A fresh 6-digit code is on its way to your email.', kind: 'good' });
    setLoading(false);
  }

  function startOver() {
    setAwaitingCode(false);
    setOtp('');
    setMsg(null);
    setMode('register');
  }

  const maskedEmail = email.replace(/^(.).*(@.*)$/, (_m, a, b) => `${a}•••${b}`);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr' }} className="lg:grid-cols-2">
      <div className="grad-hero" style={{ position: 'relative', padding: 48, display: 'none', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="grad-lime" style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center', color: '#20260a', fontWeight: 900, fontSize: 19 }}>A</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>AWIVEST</div>
            <div className="muted" style={{ fontSize: 12 }}>African Women Investors</div>
          </div>
        </div>
        <div>
          <h1 style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.08, letterSpacing: '-1px' }}>
            Wealth, built<br />
            <span className="grad-text">together.</span>
          </h1>
          <p className="muted" style={{ maxWidth: 420, marginTop: 18, fontSize: 15, lineHeight: 1.6 }}>
            Track your portfolio, build your financial profile, set goals and grow your wealth across East Africa&apos;s markets.
          </p>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>Karen Plains Arcade, Nairobi</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="card card-pad" style={{ width: '100%', maxWidth: 420, padding: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
            <div className="grad-lime" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', color: '#20260a', fontWeight: 900 }}>A</div>
            <div style={{ fontWeight: 800 }}>AWIVEST Investor Portal</div>
          </div>

          {awaitingCode ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Confirm your email</div>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
                We’ve sent a 6-digit code to <strong>{maskedEmail}</strong>. Enter it below to finish creating your account.
              </p>
              <form onSubmit={verifyCode}>
                <div className="field"><label>6-digit code</label>
                  <div className="input-group"><i className="fa-solid fa-key" />
                    <input
                      className="input"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      style={{ letterSpacing: 6, fontSize: 18 }}
                      required
                    />
                  </div>
                </div>

                {msg && (
                  <div className={`badge badge-${msg.kind}`} style={{ marginBottom: 14, width: '100%', justifyContent: 'flex-start' }}>
                    <i className={`fa-solid ${msg.kind === 'bad' ? 'fa-circle-exclamation' : 'fa-circle-check'}`} /> {msg.t}
                  </div>
                )}

                <button className="btn btn-lime btn-block" type="submit" disabled={loading}>
                  {loading ? 'Please wait…' : 'Verify & create account'}
                </button>
              </form>
              <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={resendCode} disabled={loading} type="button">
                Resend code
              </button>
              <p className="muted" style={{ textAlign: 'center', marginTop: 14, fontSize: 12.5 }}>
                Wrong email?{' '}
                <button onClick={startOver} type="button" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--lime2)', fontWeight: 600, font: 'inherit', padding: 0 }}>Start over</button>
              </p>
            </>
          ) : (
            <>
              <div className="tabs" style={{ marginBottom: 22 }}>
                <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')} type="button">Login</button>
                <button className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')} type="button">Register</button>
              </div>

              <form onSubmit={submit}>
                {mode === 'register' && (
                  <>
                    <div className="field"><label>Account type</label>
                      <div className="input-group"><i className="fa-solid fa-user-group" />
                        <select className="input" value={memberType} onChange={(e) => setMemberType(e.target.value as MemberType)} required>
                          <option value="individual">Individual</option>
                          <option value="group">Group (Chama)</option>
                          <option value="corporate">Corporate (Institution)</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>

                    <div className="field"><label>{nameLabel}</label>
                      <div className="input-group"><i className="fa-solid fa-id-card" /><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={namePlaceholder} required /></div>
                    </div>

                    {isOrg && (
                      <>
                        <div className="field"><label>Contact person</label>
                          <div className="input-group"><i className="fa-solid fa-user" /><input className="input" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Who we should speak to" required /></div>
                        </div>
                        <div className="field"><label>Their role <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
                          <div className="input-group"><i className="fa-solid fa-briefcase" /><input className="input" value={contactRole} onChange={(e) => setContactRole(e.target.value)} placeholder="e.g. Treasurer, Director" /></div>
                        </div>
                      </>
                    )}

                    <div className="field"><label>Country</label>
                      <div className="input-group"><i className="fa-solid fa-globe" />
                        <select className="input" value={country} onChange={(e) => onCountryChange(e.target.value)} required>
                          {COUNTRIES.map((c) => (<option key={c.code} value={c.name}>{c.flag} {c.name}</option>))}
                        </select>
                      </div>
                    </div>

                    <div className="field"><label>Phone</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select className="input" value={dialCode} onChange={(e) => setDialCode(e.target.value)} style={{ maxWidth: 132, flex: '0 0 auto' }} aria-label="Country dialing code">
                          {DIAL_OPTIONS.map((d) => (<option key={d.key} value={d.dial}>{d.flag} {d.dial}</option>))}
                        </select>
                        <div className="input-group" style={{ flex: 1 }}><i className="fa-solid fa-phone" /><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="7XX XXX XXX" inputMode="tel" /></div>
                      </div>
                    </div>
                  </>
                )}

                <div className="field"><label>Email</label>
                  <div className="input-group"><i className="fa-solid fa-envelope" /><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required autoComplete="email" /></div>
                </div>

                <div className="field"><label>Password</label>
                  <div className="input-group"><i className="fa-solid fa-lock" />
                    <input
                      className="input"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="8+ characters"
                      required
                      minLength={8}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      title={showPw ? 'Hide password' : 'Show password'}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--muted2)', padding: 4, lineHeight: 0 }}
                    >
                      <i className={`fa-solid ${showPw ? 'fa-eye-slash' : 'fa-eye'}`} />
                    </button>
                  </div>
                </div>

                {msg && (
                  <div className={`badge badge-${msg.kind}`} style={{ marginBottom: 14, width: '100%', justifyContent: 'flex-start' }}>
                    <i className={`fa-solid ${msg.kind === 'bad' ? 'fa-circle-exclamation' : 'fa-circle-check'}`} /> {msg.t}
                  </div>
                )}

                <button className={`btn ${mode === 'login' ? 'btn-primary' : 'btn-lime'} btn-block`} type="submit" disabled={loading}>
                  {loading ? 'Please wait…' : mode === 'login' ? 'Sign in to portal' : 'Create account'}
                </button>
              </form>

              <p className="muted" style={{ textAlign: 'center', marginTop: 16, fontSize: 12.5 }}>
                Protected by encryption. New members receive an Investor ID on sign-up.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
