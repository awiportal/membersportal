-- ============================================================================
-- AWIVEST Investor Portal — migration v1.0: opt-in email-code sign-in (2FA)
-- Adds profiles.twofa_email. When a member turns this ON, the portal asks them
-- for a one-time code emailed to their address at sign-in (an extra step on top
-- of their password). OFF by default, so no existing member is affected.
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table public.profiles
  add column if not exists twofa_email boolean not null default false;

-- Members already update their own profile row (policy "profiles_update"), and
-- staff can update any member (useful to switch this off for a locked-out
-- member), so no new RLS is required.

-- END v1.0
