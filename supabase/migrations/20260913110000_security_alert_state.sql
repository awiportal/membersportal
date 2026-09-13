-- ============================================================================
-- AWIVEST Investor Portal — #180: security / anomaly alert dedup state
--
-- Backs the /api/cron/security-alerts route. It holds one small cursor row per
-- alert stream so the same anomaly is never emailed twice:
--   * 'authspike:<bucket>'  cursor_ts = the auth_rate_limits window_start we last
--                            alerted on for that bucket (a fresh window resets it,
--                            so a new spike re-alerts but a still-open one does not).
--   * 'admin_roster'         meta = the snapshot of current Admin/Chairlady logins
--                            (role grants are detected by diffing against it).
--
-- Reads/writes go through the SERVICE-ROLE admin client only (exactly like the
-- rls_audit()/audit_log reads on /staff/security and /staff/audit). RLS is
-- enabled with NO policies, so anon/authenticated clients can neither read nor
-- write it directly — the service role bypasses RLS, matching auth_rate_limits.
--
-- Additive + idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.security_alert_state (
  alert_key  text primary key,           -- e.g. 'authspike:login:ip:1.2.3.4' | 'admin_roster'
  cursor_ts  timestamptz,                 -- last-processed timestamp (per-stream)
  cursor_id  bigint,                      -- last-alerted id, when an id cursor fits better
  meta       jsonb,                       -- snapshot / context (e.g. the admin roster)
  updated_at timestamptz not null default now()
);

alter table public.security_alert_state enable row level security;
-- No policies on purpose: this table is only ever touched through the
-- service-role admin client from the cron route, never directly by clients.
-- RLS enabled with zero policies means anon/authenticated cannot read or write.

-- END #180 security_alert_state
