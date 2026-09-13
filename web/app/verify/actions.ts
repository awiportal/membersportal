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
// The 12-hour "this device is verified" gate cookie set once a code is entered.
const GATE_COOKIE = 'awi_2fa_ok';

// Email the member a one-time sign-in code.
//
// Preferred path: our own Resend transactional email (lib/email), which is not
// subject to Supabase's built-in-email hourly cap. If Resend is unavailable —
// most commonly because the sending domain is not yet verified in Resend, or
// RESEND_API_KEY / EMAIL_FROM are unset — we FALL BACK to Supabase's built-in
// email OTP so a member is never locked out of signing in.
//
// The app-generated code is only ever stored as an HMAC challenge cookie; the
// Supabase fallback is verified directly against Supabase and sets no challenge
// cookie (its absence is how verifyCode knows which path to check).
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

  const jar = cookies();
  const code = generateSigninCode();

  const res = await sendMemberEmail({
    to: user.email,
    subject: `${code} is your AWIVEST sign-in code`,
    heading: 'Your sign-in code',
    bodyHtml: `<p style="margin:0 0 6px;">Use this code to finish signing in:</p>
<p style="font-size:30px;font-weight:800;letter-spacing:8px;margin:8px 0 14px;color:#7e2674;">${code}</p>
<p style="margin:0;color:#6a6a6a;">It expires in 10 minutes. If you didn't try to sign in, you can safely ignore this email.</p>`,
  });

  if (res.ok) {
    // Resend path: store only the signed challenge for the code we emailed.
    jar.set(CHALLENGE_COOKIE, issueSigninCodeChallenge(user.id, code), {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: SIGNIN_CODE_TTL_SECONDS,
    });
    return { ok: true };
  }

  // Resend unavailable — fall back to Supabase's built-in email OTP so sign-in
  // still works. Drop any stale challenge so verifyCode takes the Supabase path.
  console.error('sendCode: Resend send failed, falling back to Supabase OTP:', res.error);
  jar.delete(CHALLENGE_COOKIE);
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false },
  });
  if (otpErr) {
    console.error('sendCode: Supabase OTP fallback failed:', otpErr.message);
    return { error: 'We could not email your code just now. Please wait a moment and tap "Resend code".' };
  }
  return { ok: true };
}

// Verify the emailed code. Accepts EITHER our Resend challenge (HMAC cookie) or,
// when we fell back to Supabase, the Supabase email OTP. On success, remember
// this device for 12 hours so the member isn't asked again on every visit.
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

  let verified = false;
  if (challenge) {
    // Resend path: verify against our signed challenge cookie (no Supabase call).
    verified = verifySigninCodeChallenge(challenge, user.id, clean);
  } else {
    // Supabase fallback path: verify the built-in email OTP directly.
    const { error } = await supabase.auth.verifyOtp({
      email: user.email,
      token: clean,
      type: 'email',
    });
    verified = !error;
  }

  if (!verified) {
    return { error: 'That code was not correct or has expired. Please try again, or tap "Resend code".' };
  }

  // Signed, expiring token bound to this user — the actual 2FA gate cookie.
  jar.set(GATE_COOKIE, issueTwoFactorToken(user.id), {
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

// Called on sign-out. The 2FA gate (awi_2fa_ok) and any pending challenge are
// httpOnly cookies the client cannot clear itself, so an explicit sign-out must
// drop them server-side — otherwise the same member signing back in within the
// 12-hour window skips the emailed-code step entirely.
export async function clearTwoFactorGate(): Promise<void> {
  const jar = cookies();
  jar.delete(GATE_COOKIE);
  jar.delete(CHALLENGE_COOKIE);
}
