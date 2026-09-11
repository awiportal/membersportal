'use server';

import { clientIp, rateLimitAllow } from '@/lib/rateLimit';

// Server-side guard the login form calls before attempting a password sign-in.
//
// Per-IP fixed window only (NOT per-email): keying on the email would let anyone
// lock a specific member out by spamming their address. This is defense-in-depth
// over Supabase's own auth throttling and only covers the UI path — a raw API
// caller is limited by Supabase directly. Fail-open, so it can never block a
// real member.
export async function guardLogin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = clientIp();
  const allowed = await rateLimitAllow(`login:ip:${ip}`, 10, 300); // 10 / 5 min
  if (!allowed) {
    return {
      ok: false,
      error: 'Too many sign-in attempts from your network. Please wait a few minutes and try again.',
    };
  }
  return { ok: true };
}
