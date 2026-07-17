-- ============================================================================
-- AWIVEST Investor Portal — migration v0.8: profile & settings
-- Adds member-level preference storage so the Settings page can persist:
--   * notification_prefs — per-member notification/channel toggles (jsonb)
--   * locale             — preferred language (BCP-47-ish code, e.g. 'en','sw')
--   * timezone           — preferred IANA time zone (e.g. 'Africa/Nairobi')
-- The Profile page reuses existing columns (full_name, phone, country,
-- physical_address, postal_address, date_of_birth) — no new columns needed there.
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb,
  add column if not exists locale             text,
  add column if not exists timezone           text;

-- Members already update their own profile row (policy "profiles_update":
-- id = auth.uid() OR is_staff()), so no new RLS is required for these columns.

-- END v0.8
