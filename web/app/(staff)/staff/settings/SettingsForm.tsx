'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveEsignSettings, testPandadoc, previewOnboardingDoc } from './actions';

type Initial = { onboarding: string; oneoff: string; role: string; apiKeyPresent: boolean };

export default function SettingsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [onboarding, setOnboarding] = useState(initial.onboarding);
  const [oneoff, setOneoff] = useState(initial.oneoff);
  const [role, setRole] = useState(initial.role || 'Investor');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'good' | 'bad'; text: string; url?: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy('save');
    try {
      const fd = new FormData();
      fd.set('onboarding_template_id', onboarding.trim());
      fd.set('oneoff_template_id', oneoff.trim());
      fd.set('signer_role', role.trim());
      const res = await saveEsignSettings(fd);
      if (res?.error) setMsg({ kind: 'bad', text: res.error });
      else {
        setMsg({ kind: 'good', text: 'Settings saved.' });
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setMsg(null);
    setBusy('test');
    try {
      const res = await testPandadoc();
      if (res?.error) setMsg({ kind: 'bad', text: res.error });
      else setMsg({ kind: 'good', text: 'PandaDoc connection works — your API key is valid.' });
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    setMsg(null);
    setBusy('preview');
    try {
      const res = await previewOnboardingDoc();
      if (res?.error) setMsg({ kind: 'bad', text: res.error });
      else setMsg({ kind: 'good', text: 'Test document created. Open it to confirm signing works:', url: res.url });
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={save} className="card card-pad">
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>E-signing (PandaDoc)</div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
        API key:{' '}
        {initial.apiKeyPresent ? (
          <span className="badge badge-good" style={{ fontSize: 11 }}>Present on server</span>
        ) : (
          <span className="badge badge-bad" style={{ fontSize: 11 }}>Missing — add PANDADOC_API_KEY in Vercel</span>
        )}
      </div>

      {msg && (
        <div className={`badge badge-${msg.kind === 'good' ? 'good' : 'bad'}`} style={{ marginBottom: 16, width: '100%', justifyContent: 'flex-start' }}>
          <i className={`fa-solid ${msg.kind === 'good' ? 'fa-circle-check' : 'fa-circle-exclamation'}`} /> {msg.text}
          {msg.url && (
            <>
              {' '}
              <a href={msg.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 6, textDecoration: 'underline', fontWeight: 700 }}>
                Open test document
              </a>
            </>
          )}
        </div>
      )}

      <div className="field">
        <label>Onboarding Packet Template ID</label>
        <input className="input" value={onboarding} onChange={(e) => setOnboarding(e.target.value)} placeholder="e.g. 93cUUrnFxVjXerjDsi8XkK" />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Used for the agreement each new member e-signs during onboarding.</div>
      </div>

      <div className="field">
        <label>One-off Agreement Template ID</label>
        <input className="input" value={oneoff} onChange={(e) => setOneoff(e.target.value)} placeholder="e.g. 93cUUrnFxVjXerjDsi8XkK" />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Used when sending a single agreement to one investor from their profile.</div>
      </div>

      <div className="field">
        <label>Signer role name</label>
        <input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Investor" />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>The recipient role your PandaDoc template assigns to the member (case-sensitive). Default: Investor.</div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        <button className="btn btn-lime" type="submit" disabled={busy !== null}>
          {busy === 'save' ? 'Saving…' : <><i className="fa-solid fa-floppy-disk" /> Save settings</>}
        </button>
        <button className="btn btn-ghost" type="button" onClick={test} disabled={busy !== null}>
          {busy === 'test' ? 'Testing…' : <><i className="fa-solid fa-plug" /> Test connection</>}
        </button>
        <button className="btn btn-ghost" type="button" onClick={preview} disabled={busy !== null}>
          {busy === 'preview' ? 'Creating…' : <><i className="fa-solid fa-file-signature" /> Create test document</>}
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        &ldquo;Create test document&rdquo; builds an onboarding packet addressed to you and returns a signing link — a quick way to confirm your template and role are correct before members use it.
      </div>
    </form>
  );
}
