'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { issueTwoFactorToken, TWOFA_TTL_SECONDS } from '@/lib/twofa';

// Email the member a one-time sign-in code. Uses Supabase's email OTP, which
// reuses the project's existing auth email set-up.
export async function sendCode(): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Your session has expired. Please sign in again.' };

  const { error } = await supabase.auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    console.error('sendCode failed:', error.message);
    return { error: 'We could not email your code just now. Please wait a moment and tap “Resend code”.' };
  }
  return { ok: true };
}

// Verify the 6-digit code. On success, remember this device for 12 hours so the
// member isn't asked again on every visit.
export async function verifyCode(token: string): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Your session has expired. Please sign in again.' };

  const clean = String(token || '').replace(/\D/g, '').slice(0, 8);
  if (clean.length < 6) return { error: 'Please enter the 6-digit code from your email.' };

  const { error } = await supabase.auth.verifyOtp({ email: user.email, token: clean, type: 'email' });
  if (error) {
    console.error('verifyCode failed:', error.message);
    return { error: 'That code was not correct or has expired. Please try again, or tap “Resend code”.' };
  }

  // Signed, expiring token bound to this user — cannot be forged from the
  // (known) user id alone, unlike the previous raw-uid cookie value.
  cookies().set('awi_2fa_ok', issueTwoFactorToken(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: TWOFA_TTL_SECONDS, // 12 hours
  });
  return { ok: true };
}
