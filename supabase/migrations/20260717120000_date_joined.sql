-- ============================================================================
-- AWIVEST Investor Portal — migration v0.9: member join date
-- Adds profiles.date_joined — the member's ACTUAL date of joining AWIVEST
-- (captured on the registration form). This is distinct from `joined_at`, which
-- is the portal approval timestamp. The profile shows date_joined as
-- "Member since", and it will also be populated for legacy members during the
-- 2017-to-date audited-data import.
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table public.profiles
  add column if not exists date_joined date;

-- Members already update their own profile row (policy "profiles_update"), and
-- staff can update any member, so no new RLS is required for this column.

-- END v0.9
