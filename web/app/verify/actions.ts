'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  issueTwoFactorToken,
  TWOFA_TTL_SECONDS,
  generateSigninCode,
  issueSigninCodeChallenge,
  verifySigninCodeChallenge,
  SIGNIN_CODE_TTL_SECONDS,
} from '@/lib/twofa';
import { rateLimitAllow } from '@/lib/rateLimit';
import { sendMemberEmail } from '@/lib/email';

// One-time challenge cookie holding the signed (never plaintext) sign-in code.
const CHALLENGE_COOKIE = 'awi_2fa_chal';

// Email the member a one-time sign-in code via our own Resend transactional
// email (lib/email), NOT Supabase's built-in auth email. Supabase's default
// email sender is capped to a few messages per hour for the whole project,
// which is what was stopping codes from arriving. The code is generated here;
// only its HMAC is stored (in an httpOnly cookie), so nothing sensitive is
// persisted server-side.
export async function sendCode(): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Your session has expired. Please sign in again.' };

  // Cap code requests per account (email flooding / cost). Fail-open.
  if (!(await rateLimitAllow(`2fa-send:${user.id}`, 5, 900))) {
    return { error: 'Too many code requests. Please wait a few minutes before requesting another code.' };
  }

  const code = generateSigninCode();

  const res = await sendMemberEmail({
    to: user.email,
    subject: `${code} is your AWIVEST sign-in code`,
    heading: 'Your sign-in code',
    bodyHtml: `<p style="margin:0 0 6px;">Use this code to finish signing in:</p>
<p style="font-size:30px;font-weight:800;letter-spacing:8px;margin:8px 0 14px;color:#7e2674;">${code}</p>
<p style="margin:0;color:#6a6a6a;">It expires in 10 minutes. If you didn't try to sign in, you can safely ignore this email.</p>`,
  });
  if (!res.ok) {
    console.error('sendCode (resend) failed:', res.error);
    return { error: 'We could not email your code just now. Please wait a moment and tap "Resend code".' };
  }

  // Stateless verification: store only the signed challenge for the code that
  // was actually emailed. httpOnly + 10-minute expiry.
  cookies().set(CHALLENGE_COOKIE, issueSigninCodeChallenge(user.id, code), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: SIGNIN_CODE_TTL_SECONDS,
  });

  return { ok: true };
}

// Verify the emailed code. On success, remember this device for 12 hours so the
// member isn't asked again on every visit.
export async function verifyCode(token: string): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Your session has expired. Please sign in again.' };

  // Cap verification attempts per account (code brute force). Fail-open.
  if (!(await rateLimitAllow(`2fa-check:${user.id}`, 10, 900))) {
    return { error: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const clean = String(token || '').replace(/\D/g, '').slice(0, 8);
  if (clean.length < 6) return { error: 'Please enter the code from your email.' };

  const jar = cookies();
  const challenge = jar.get(CHALLENGE_COOKIE)?.value;
  if (!verifySigninCodeChallenge(challenge, user.id, clean)) {
    return { error: 'That code was not correct or has expired. Please try again, or tap "Resend code".' };
  }

  // Signed, expiring token bound to this user — the actual 2FA gate cookie.
  jar.set('awi_2fa_ok', issueTwoFactorToken(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: TWOFA_TTL_SECONDS, // 12 hours
  });
  // One-time: consume the challenge so the code cannot be replayed.
  jar.delete(CHALLENGE_COOKIE);
  return { ok: true };
}
