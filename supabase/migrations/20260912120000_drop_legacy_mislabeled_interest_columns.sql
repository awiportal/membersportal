-- Drop two legacy, mislabeled interest columns from member_finances.
--
-- They were rounded duplicates of authoritative exact-cent columns, and their
-- names did NOT match their contents:
--   britam_interest_2026  actually held round(jubilee_mmf)
--   jubilee_interest_2026 actually held round(jubilee_fif + jubilee_fif_apr_jul)
--
-- The correctly-named, exact-cent columns are the single source of truth and are
-- used everywhere in the app:
--   interest_2018_2023, britam_interest_life, jubilee_mmf, jubilee_fif,
--   jubilee_fif_apr_jul  (plus total_interest_2026 for the aggregate).
--
-- No view, function, RLS policy, trigger, index or constraint depends on these
-- columns, and no application code references them any more. Idempotent.
alter table public.member_finances
  drop column if exists britam_interest_2026,
  drop column if exists jubilee_interest_2026;
