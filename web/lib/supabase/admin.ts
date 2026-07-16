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
