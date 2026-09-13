// Shared authorization gate for Vercel Cron endpoints.
//
// Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}` on every
// scheduled invocation once the CRON_SECRET environment variable is set (Vercel
// > Settings > Environment Variables). We require that exact header on both cron
// routes so the endpoints cannot be triggered by an anonymous caller — they read
// security telemetry and send email, so they must not be open.
//
// FAIL-CLOSED: if CRON_SECRET is not configured we reject every request. That
// means the crons return 401 until the secret is set, which is the safe default
// for an endpoint like this (better than briefly exposing it unauthenticated).
// Manual invocation is supported and idempotent — just send the same bearer
// header, e.g. `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/...`.

export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — no secret configured
  return req.headers.get('authorization') === `Bearer ${secret}`;
}
