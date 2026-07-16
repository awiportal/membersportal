'use client';

import { useEffect, useState } from 'react';
import { sendOneOffAgreement, listEsignTemplates } from '../../actions';

type Template = { id: string; name: string };

export default function OneOffAgreement({
  memberId,
  memberEmail,
  configured,
}: {
  memberId: string;
  memberEmail: string;
  configured: boolean;
}) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!configured) {
      setTemplates([]);
      return;
    }
    let active = true;
    listEsignTemplates()
      .then((res) => {
        if (!active) return;
        if (res.error) setLoadErr(res.error);
        const list = res.templates || [];
        setTemplates(list);
        const preferred =
          res.defaultTemplateId && list.some((t) => t.id === res.defaultTemplateId)
            ? res.defaultTemplateId
            : list[0]?.id || '';
        setSelected(preferred);
      })
      .catch((e: any) => {
        if (!active) return;
        setLoadErr(e?.message || 'Could not load templates from PandaDoc.');
        setTemplates([]);
      });
    return () => {
      active = false;
    };
  }, [configured]);

  async function send() {
    if (!selected) return;
    setMsg(null);
    setBusy(true);
    try {
      const name = templates?.find((t) => t.id === selected)?.name || 'the agreement';
      const res = await sendOneOffAgreement(memberId, selected);
      if (res.error) setMsg({ kind: 'err', text: res.error });
      else
        setMsg({
          kind: 'ok',
          text: `Sent "${res.templateName || name}". PandaDoc has emailed ${memberEmail} a secure signing link.`,
        });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.message || 'Could not send the agreement. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
        Connect PandaDoc (add the API key in{' '}
        <a href="/staff/settings" style={{ color: 'var(--lime2)' }}>Settings</a>) to send agreements.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      {templates === null ? (
        <div className="muted" style={{ fontSize: 12 }}>Loading documents…</div>
      ) : templates.length === 0 ? (
        <div className="muted" style={{ fontSize: 11.5 }}>
          {loadErr || 'No PandaDoc templates found. Create a template in PandaDoc first.'}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="input"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={busy}
            style={{ flex: '1 1 220px', minWidth: 180 }}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={send}
            disabled={busy || !selected}
            style={{ whiteSpace: 'nowrap' }}
          >
            {busy ? 'Sending…' : (<><i className="fa-solid fa-paper-plane" /> Send</>)}
          </button>
        </div>
      )}
      {loadErr && templates && templates.length > 0 && (
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>{loadErr}</div>
      )}
      {msg && (
        <div
          className={`badge ${msg.kind === 'ok' ? 'badge-good' : 'badge-bad'}`}
          style={{ marginTop: 8, fontSize: 11.5 }}
        >
          <i className={`fa-solid ${msg.kind === 'ok' ? 'fa-circle-check' : 'fa-circle-exclamation'}`} /> {msg.text}
        </div>
      )}
    </div>
  );
}
