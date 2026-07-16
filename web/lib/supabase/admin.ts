import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client that uses the SERVICE-ROLE key.
 *
 * This client BYPASSES row-level security. NEVER import it into a client
 * component or expose the key to the browser — the service-role key must stay
 * on the server. Callers must verify the user is authorised (e.g. staff)
 * BEFORE using this client for any write.
 *
 * Requires the SUPABASE_SERVICE_ROLE_KEY environment variable (set it in
 * Vercel > Settings > Environment Variables — do NOT prefix it with
 * NEXT_PUBLIC_).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel > Settings > Environment Variables, then redeploy.'
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Inspect the SUPABASE_SERVICE_ROLE_KEY *without trusting it*. Supabase API
 * keys are JWTs whose payload carries a `role` claim ("service_role" or
 * "anon"). We decode (do NOT verify) the payload only to catch the common
 * mistake of pasting the anon/public key into the service-role slot — which
 * would leave row-level security in force and produce the exact "new row
 * violates row-level security policy" error. The secret itself is never
 * returned or logged.
 */
export function describeServiceKey(): { ok: boolean; role: string; message: string } {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    return {
      ok: false,
      role: 'missing',
      message:
        'SUPABASE_SERVICE_ROLE_KEY is not set on the server. Add it in Vercel > Settings > Environment Variables and redeploy.',
    };
  }
  const parts = key.split('.');
  if (parts.length < 2) {
    return {
      ok: false,
      role: 'invalid',
      message: 'The value in SUPABASE_SERVICE_ROLE_KEY does not look like a Supabase API key.',
    };
  }
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    const role = String(payload.role || 'unknown');
    if (role !== 'service_role') {
      return {
        ok: false,
        role,
        message:
          `The key in SUPABASE_SERVICE_ROLE_KEY is the "${role}" key, not the service_role key. ` +
          'In Supabase open Settings > API, copy the key labelled "service_role" (secret — it warns it can bypass ' +
          'row-level security), paste that into the SUPABASE_SERVICE_ROLE_KEY variable in Vercel, and redeploy.',
      };
    }
    return { ok: true, role, message: 'ok' };
  } catch {
    return {
      ok: false,
      role: 'unparseable',
      message: 'Could not read SUPABASE_SERVICE_ROLE_KEY; re-copy the service_role (secret) key from Supabase Settings > API.',
    };
  }
}
