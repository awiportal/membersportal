import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

// Best-effort client IP from the proxy headers Vercel/Next set in front of the
// app. Falls back to 'unknown' so a missing header still yields a stable bucket.
export function clientIp(): string {
  const h = headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return h.get('x-real-ip') || 'unknown';
}

// Returns TRUE if the action is allowed, FALSE if it should be blocked.
//
// FAIL-OPEN by design: any error (RPC not yet migrated, DB hiccup, etc.) returns
// TRUE. This limiter is defense-in-depth, never the primary auth gate, so a
// problem here must never lock members out. Backed by the rate_limit_hit RPC
// (see supabase/migrations/*_auth_rate_limits.sql).
export async function rateLimitAllow(
  bucket: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('rate_limit_hit', {
      p_bucket: bucket,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error('rate_limit_hit error (failing open):', error.message);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error('rate_limit_hit threw (failing open):', err);
    return true;
  }
}
