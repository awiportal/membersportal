-- ---------------------------------------------------------------------------
-- Stage B: international membership details
-- Adds a registration number (groups & corporates) and a flexible, structured
-- international address to profiles, so the "Complete your membership" step can
-- serve individuals, groups and corporations in any country.
-- The existing kra_pin column is reused as a generic (optional) Tax ID.
-- Idempotent: safe to run more than once.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists registration_number text,   -- group constitution / company incorporation no.
  add column if not exists address_line1        text,
  add column if not exists address_line2        text,
  add column if not exists city                 text,
  add column if not exists state_region         text,   -- state / province / county / region
  add column if not exists postal_code          text;   -- ZIP / postal code

comment on column public.profiles.registration_number is 'Group constitution or company/incorporation number (groups & corporates)';
comment on column public.profiles.kra_pin             is 'Optional Tax ID / KRA PIN — never required (international members may not have one)';
comment on column public.profiles.address_line1       is 'Street / building — flexible international address';
comment on column public.profiles.state_region        is 'State / province / county / region';
comment on column public.profiles.postal_code         is 'ZIP / postal code';
