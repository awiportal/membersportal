import crypto from 'crypto';

/**
 * Tamper-proof token for the opt-in email step-up (2FA) cookie.
 *
 * The previous gate stored the raw user id as the cookie value and checked
 * `cookie === user.id`. Because a user's id is known to anyone who has passed
 * the first factor (it is returned by getUser after a password sign-in), that
 * cookie was trivially forgeable — an attacker with only the password could set
 * `awi_2fa_ok=<their own uid>` and skip the emailed code entirely.
 *
 * Here the cookie is an HMAC-signed, expiring token bound to the user id, so it
 * cannot be forged without the server signing secret.
 */
function signingKey(): string {
  // Prefer a dedicated secret; fall back to the server-only service-role key so
  // the cookie is always signed with a value the browser never sees. Never
  // expose either to the client. In production, set AWI_2FA_SECRET.
  return (
    process.env.AWI_2FA_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'awi-2fa-dev-only-secret-change-me'
  );
}

export const TWOFA_TTL_SECONDS = 60 * 60 * 12; // 12 hours

/** Issue an opaque token: base64url(uid:exp).hexHmac */
export function issueTwoFactorToken(userId: string, ttlSeconds = TWOFA_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = Buffer.from(`${userId}:${exp}`).toString('base64url');
  const sig = crypto.createHmac('sha256', signingKey()).update(body).digest('hex');
  return `${body}.${sig}`;
}

/** Verify a token is authentic, unexpired, and bound to this user. */
export function verifyTwoFactorToken(token: string | undefined | null, userId: string): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', signingKey()).update(body).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  let payload: string;
  try {
    payload = Buffer.from(body, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const sep = payload.lastIndexOf(':');
  if (sep <= 0) return false;
  const uid = payload.slice(0, sep);
  const exp = Number(payload.slice(sep + 1));
  if (uid !== userId) return false;
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return true;
}
