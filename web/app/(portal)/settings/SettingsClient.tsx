'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { NOTIFICATION_PREFS, CHANNEL_PREFS, LOCALES, FALLBACK_TIMEZONES, withDefaults } from '@/lib/prefs';
import { updateNotifications, updateRegional, changePassword, updateTwofa } from './actions';

type Msg = { kind: 'ok' | 'err'; text: string } | null;

function Banner({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <div
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
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        background: on ? 'var(--lime2)' : 'var(--surface2)',
        position: 'relative',
        transition: 'background .15s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .15s',
          boxShadow: '0 1px 3px rgba(0,0,0,.35)',
        }}
      />
    </button>
  );
}

function PrefRow({ label, desc, on, onChange, last }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--border)', gap: 14 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div className="muted" style={{ fontSize: 12 }}>{desc}</div>
      </div>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  );
}

function SectionTitle({ icon, color, children }: { icon: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>
      <i className={`fa-solid ${icon}`} style={{ color }} /> {children}
    </div>
  );
}

export default function SettingsClient({
  accountEmail,
  notificationPrefs,
  locale,
  timezone,
  twofaEmail,
}: {
  accountEmail: string;
  notificationPrefs: Record<string, boolean>;
  locale: string;
  timezone: string;
  twofaEmail: boolean;
}) {
  // ---- Two-factor (email code) --------------------------------------------
  const [twofaOn, setTwofaOn] = useState<boolean>(twofaEmail);
  const [twofaMsg, setTwofaMsg] = useState<Msg>(null);
  const [twofaPending, startTwofa] = useTransition();
  function toggleTwofa(next: boolean) {
    setTwofaOn(next);
    setTwofaMsg(null);
    startTwofa(async () => {
      const res = await updateTwofa(next);
      if ((res as any)?.error) {
        setTwofaOn(!next);
        setTwofaMsg({ kind: 'err', text: (res as any).error });
      } else {
        setTwofaMsg({
          kind: 'ok',
          text: next
            ? 'Email code sign-in is on. You’ll be asked for a code the next time you sign in.'
            : 'Email code sign-in is off.',
        });
      }
    });
  }

  // ---- Appearance ----------------------------------------------------------
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  useEffect(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('awivest-theme');
    } catch {}
    setTheme((attr || stored) === 'light' ? 'light' : 'dark');
  }, []);
  function applyTheme(t: 'light' | 'dark') {
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem('awivest-theme', t);
    } catch {}
  }

  // ---- Regional ------------------------------------------------------------
  const timezones = useMemo(() => {
    try {
      const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
      if (typeof anyIntl.supportedValuesOf === 'function') {
        const list = anyIntl.supportedValuesOf('timeZone');
        if (Array.isArray(list) && list.length) return list;
      }
    } catch {}
    return FALLBACK_TIMEZONES;
  }, []);
  const browserTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      return '';
    }
  }, []);
  const [lang, setLang] = useState(locale || 'en');
  const [tz, setTz] = useState(timezone || '');
  const [regMsg, setRegMsg] = useState<Msg>(null);
  const [regPending, startReg] = useTransition();
  function saveRegional() {
    setRegMsg(null);
    startReg(async () => {
      const res = await updateRegional({ locale: lang, timezone: tz });
      setRegMsg((res as any)?.error ? { kind: 'err', text: (res as any).error } : { kind: 'ok', text: 'Language and time zone saved.' });
    });
  }

  // ---- Notifications -------------------------------------------------------
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => withDefaults(notificationPrefs));
  const [notifMsg, setNotifMsg] = useState<Msg>(null);
  const [notifPending, startNotif] = useTransition();
  function setPref(key: string, v: boolean) {
    setPrefs((p) => ({ ...p, [key]: v }));
  }
  function saveNotifs() {
    setNotifMsg(null);
    startNotif(async () => {
      const res = await updateNotifications(prefs);
      setNotifMsg((res as any)?.error ? { kind: 'err', text: (res as any).error } : { kind: 'ok', text: 'Notification preferences saved.' });
    });
  }

  // ---- Security ------------------------------------------------------------
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [secMsg, setSecMsg] = useState<Msg>(null);
  const [secPending, startSec] = useTransition();
  function savePassword() {
    setSecMsg(null);
    if (pw.length < 8) {
      setSecMsg({ kind: 'err', text: 'Your new password must be at least 8 characters.' });
      return;
    }
    if (pw !== pw2) {
      setSecMsg({ kind: 'err', text: 'The two passwords do not match.' });
      return;
    }
    startSec(async () => {
      const res = await changePassword({ password: pw });
      if ((res as any)?.error) setSecMsg({ kind: 'err', text: (res as any).error });
      else {
        setSecMsg({ kind: 'ok', text: 'Your password has been updated.' });
        setPw('');
        setPw2('');
      }
    });
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="mb-5">
        <div className="page-title">Settings</div>
        <div className="sub">Manage your security, notifications, language and appearance.</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Appearance */}
        <div className="card card-pad">
          <SectionTitle icon="fa-circle-half-stroke" color="var(--purple2)">Appearance</SectionTitle>
          <div className="flex items-center justify-between" style={{ gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Theme</div>
              <div className="muted" style={{ fontSize: 12 }}>Choose how the portal looks on this device.</div>
            </div>
            <div style={{ display: 'inline-flex', background: 'var(--surface2)', borderRadius: 12, padding: 4, gap: 4 }}>
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => applyTheme(t)}
                  className="btn btn-sm"
                  style={{
                    border: 'none',
                    borderRadius: 9,
                    fontWeight: 600,
                    background: theme === t ? 'var(--purple)' : 'transparent',
                    color: theme === t ? '#fff' : 'var(--muted)',
                  }}
                >
                  <i className={`fa-solid ${t === 'light' ? 'fa-sun' : 'fa-moon'}`} /> {t === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Regional */}
        <div className="card card-pad">
          <SectionTitle icon="fa-globe" color="var(--lime2)">Language &amp; region</SectionTitle>
          <Banner msg={regMsg} />
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            <div className="field">
              <label>Language</label>
              <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
                {LOCALES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Time zone</label>
              <select className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
                <option value="">{browserTz ? `Auto — ${browserTz}` : 'Select a time zone…'}</option>
                {timezones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            We use these to show dates, times and amounts in a way that suits you. Currency stays in KES for now.
          </div>
          <button className="btn btn-primary mt-2" onClick={saveRegional} disabled={regPending}>
            {regPending ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" /> Saving…
              </>
            ) : (
              <>
                <i className="fa-solid fa-floppy-disk" /> Save
              </>
            )}
          </button>
        </div>

        {/* Notifications */}
        <div className="card card-pad">
          <SectionTitle icon="fa-bell" color="var(--purple2)">Notifications</SectionTitle>
          <Banner msg={notifMsg} />
          <div style={{ fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', margin: '2px 0 2px' }}>
            Tell me about
          </div>
          {NOTIFICATION_PREFS.map((p, i) => (
            <PrefRow key={p.key} label={p.label} desc={p.desc} on={!!prefs[p.key]} onChange={(v) => setPref(p.key, v)} last={i === NOTIFICATION_PREFS.length - 1} />
          ))}
          <div style={{ fontWeight: 600, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', margin: '16px 0 2px' }}>
            Reach me by
          </div>
          {CHANNEL_PREFS.map((p, i) => (
            <PrefRow key={p.key} label={p.label} desc={p.desc} on={!!prefs[p.key]} onChange={(v) => setPref(p.key, v)} last={i === CHANNEL_PREFS.length - 1} />
          ))}
          <button className="btn btn-primary mt-2" onClick={saveNotifs} disabled={notifPending}>
            {notifPending ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" /> Saving…
              </>
            ) : (
              <>
                <i className="fa-solid fa-floppy-disk" /> Save preferences
              </>
            )}
          </button>
        </div>

        {/* Security */}
        <div className="card card-pad">
          <SectionTitle icon="fa-shield-halved" color="var(--lime2)">Security</SectionTitle>
          <Banner msg={secMsg} />
          <div className="field">
            <label>Account email</label>
            <input className="input" value={accountEmail} disabled />
          </div>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            <div className="field">
              <label>New password</label>
              <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="8+ characters" autoComplete="new-password" />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Re-enter new password" autoComplete="new-password" />
            </div>
          </div>
          <button className="btn btn-primary mt-2" onClick={savePassword} disabled={secPending}>
            {secPending ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" /> Updating…
              </>
            ) : (
              <>
                <i className="fa-solid fa-key" /> Update password
              </>
            )}
          </button>

          <div style={{ padding: '14px 0 0', marginTop: 14, borderTop: '1px solid var(--border)' }}>
            <Banner msg={twofaMsg} />
            <div className="flex items-center justify-between" style={{ gap: 14 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Email code at sign-in</div>
                <div className="muted" style={{ fontSize: 12 }}>Extra security: we email you a one-time code when you sign in on a new device.</div>
              </div>
              <Toggle on={twofaOn} onChange={toggleTwofa} label="Email code at sign-in" />
            </div>
            {twofaPending ? <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Saving…</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
