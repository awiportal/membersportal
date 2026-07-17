'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendCode, verifyCode } from './actions';

type Msg = { kind: 'ok' | 'err' | 'info'; text: string } | null;

export default function VerifyClient({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const [sending, startSend] = useTransition();
  const sentOnce = useRef(false);

  useEffect(() => {
    if (sentOnce.current) return;
    sentOnce.current = true;
    startSend(async () => {
      const res = await sendCode();
      setMsg(
        (res as any)?.error
          ? { kind: 'err', text: (res as any).error }
          : { kind: 'info', text: 'We’ve emailed you a 6-digit code. Please check your inbox.' }
      );
    });
  }, []);

  function submit() {
    setMsg(null);
    const token = code.trim();
    if (token.length < 6) {
      setMsg({ kind: 'err', text: 'Please enter the 6-digit code from your email.' });
      return;
    }
    start(async () => {
      const res = await verifyCode(token);
      if ((res as any)?.error) setMsg({ kind: 'err', text: (res as any).error });
      else {
        setMsg({ kind: 'ok', text: 'Verified. Taking you in…' });
        router.push('/dashboard');
        router.refresh();
      }
    });
  }

  function resend() {
    setMsg(null);
    setCode('');
    startSend(async () => {
      const res = await sendCode();
      setMsg(
        (res as any)?.error
          ? { kind: 'err', text: (res as any).error }
          : { kind: 'info', text: 'A fresh code is on its way to your email.' }
      );
    });
  }

  const masked = email.replace(/^(.).*(@.*)$/, (_m, a, b) => `${a}•••${b}`);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card card-pad" style={{ width: '100%', maxWidth: 420 }}>
        <div
          className="grad-lime"
          style={{ width: 52, height: 52, borderRadius: 15, display: 'grid', placeItems: 'center', color: '#20260a', margin: '0 auto 14px' }}
        >
          <i className="fa-solid fa-shield-halved" style={{ fontSize: 20 }} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>Enter your sign-in code</div>
        <p className="muted" style={{ fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 1.5 }}>
          For extra security, we’ve emailed a 6-digit code to <strong>{masked}</strong>. Enter it below to continue.
        </p>

        {msg ? (
          <div
            style={{
              margin: '14px 0',
              borderRadius: 12,
              fontSize: 13.5,
              fontWeight: 600,
              padding: '11px 14px',
              border: `1px solid ${msg.kind === 'ok' ? 'rgba(166,205,53,0.4)' : msg.kind === 'err' ? 'rgba(239,90,90,0.4)' : 'var(--border)'}`,
              color: msg.kind === 'ok' ? 'var(--lime2)' : msg.kind === 'err' ? '#ef7f7f' : 'var(--muted)',
              background: msg.kind === 'ok' ? 'rgba(166,205,53,0.08)' : msg.kind === 'err' ? 'rgba(239,90,90,0.08)' : 'var(--surface2)',
            }}
          >
            {msg.text}
          </div>
        ) : null}

        <div className="field" style={{ marginTop: 14 }}>
          <label>6-digit code</label>
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            style={{ letterSpacing: 6, fontSize: 20, textAlign: 'center' }}
          />
        </div>

        <button className="btn btn-primary btn-block" onClick={submit} disabled={pending}>
          {pending ? (
            <>
              <i className="fa-solid fa-spinner fa-spin" /> Checking…
            </>
          ) : (
            <>
              <i className="fa-solid fa-arrow-right-to-bracket" /> Verify &amp; continue
            </>
          )}
        </button>
        <button className="btn btn-ghost btn-block mt-2" onClick={resend} disabled={sending}>
          {sending ? 'Sending…' : 'Resend code'}
        </button>

        <p className="muted" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
          Didn’t get it? Check your spam folder, or tap “Resend code”. If you still can’t sign in, contact the AWIVEST office and we’ll help you straight away.
        </p>
      </div>
    </div>
  );
}
