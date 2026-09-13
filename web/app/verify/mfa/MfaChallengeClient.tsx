'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Client step-up: challenge + verify the account's verified TOTP factor. On
// success the Supabase session is elevated to aal2 (persisted to the shared
// cookies), so the server gate in the staff layout then lets the admin through.
export default function MfaChallengeClient() {
  const router = useRouter();
  const supabase = createClient();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, start] = useTransition();
  const factorId = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.find((f) => f.status === 'verified');
      if (error || !totp) {
        setErr('No authenticator app is set up on this account. Contact the AWIVEST office for help.');
      } else {
        factorId.current = totp.id;
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    setErr(null);
    const clean = code.replace(/\D/g, '').slice(0, 6);
    if (clean.length < 6) {
      setErr('Enter the 6-digit code from your authenticator app.');
      return;
    }
    const id = factorId.current;
    if (!id) {
      setErr('No authenticator app is set up on this account.');
      return;
    }
    start(async () => {
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: id });
      if (cErr || !ch) {
        setErr('Could not start verification. Please try again.');
        return;
      }
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId: id, challengeId: ch.id, code: clean });
      if (vErr) {
        setErr('That code was not correct or has expired. Enter the current code from your app.');
        return;
      }
      router.push('/');
      router.refresh();
    });
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card card-pad" style={{ width: '100%', maxWidth: 420 }}>
        <div
          className="grad-lime"
          style={{ width: 52, height: 52, borderRadius: 15, display: 'grid', placeItems: 'center', color: '#20260a', margin: '0 auto 14px' }}
        >
          <i className="fa-solid fa-mobile-screen-button" style={{ fontSize: 20 }} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>Authenticator check</div>
        <p className="muted" style={{ fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 1.5 }}>
          Your account has extra protection. Open your authenticator app and enter the current 6-digit code to continue.
        </p>

        {err ? (
          <div
            style={{
              margin: '14px 0',
              borderRadius: 12,
              fontSize: 13.5,
              fontWeight: 600,
              padding: '11px 14px',
              border: '1px solid rgba(239,90,90,0.4)',
              color: '#ef7f7f',
              background: 'rgba(239,90,90,0.08)',
            }}
          >
            {err}
          </div>
        ) : null}

        <div className="field" style={{ marginTop: 14 }}>
          <label>Authenticator code</label>
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            disabled={!ready}
            style={{ letterSpacing: 6, fontSize: 20, textAlign: 'center' }}
          />
        </div>

        <button className="btn btn-primary btn-block" onClick={submit} disabled={pending || !ready}>
          {pending ? (
            <>
              <i className="fa-solid fa-spinner fa-spin" /> Checking...
            </>
          ) : (
            <>
              <i className="fa-solid fa-arrow-right-to-bracket" /> Verify &amp; continue
            </>
          )}
        </button>

        <p className="muted" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
          Lost access to your authenticator app? Contact the AWIVEST office and we will help you regain access.
        </p>
      </div>
    </div>
  );
}
