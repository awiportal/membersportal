'use client';

import { useState } from 'react';
import { sendOneOffAgreement } from '../../actions';

export default function OneOffAgreement({
  memberId,
  memberEmail,
  configured,
}: {
  memberId: string;
  memberEmail: string;
  configured: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function send() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await sendOneOffAgreement(memberId);
      if (res.error) setMsg({ kind: 'err', text: res.error });
      else setMsg({ kind: 'ok', text: `Sent. PandaDoc has emailed ${memberEmail} a secure signing link.` });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.message || 'Could not send the agreement. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={send} disabled={busy || !configured}>
        {busy ? 'Sending…' : (<><i className="fa-solid fa-paper-plane" /> Send one-off agreement</>)}
      </button>
      {!configured && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          Set a One-off Template ID in <a href="/staff/settings" style={{ color: 'var(--lime2)' }}>Settings</a> to enable this.
        </div>
      )}
      {msg && (
        <div className={`badge ${msg.kind === 'ok' ? 'badge-good' : 'badge-bad'}`} style={{ marginTop: 8, fontSize: 11.5 }}>
          <i className={`fa-solid ${msg.kind === 'ok' ? 'fa-circle-check' : 'fa-circle-exclamation'}`} /> {msg.text}
        </div>
      )}
    </div>
  );
}
