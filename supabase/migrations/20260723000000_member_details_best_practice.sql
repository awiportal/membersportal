-- ---------------------------------------------------------------------------
-- Stage D: essential per-type membership details (international best practice)
-- Adds the fields each account type genuinely needs, so a group submits group
-- details, an institution submits institution details, and an individual
-- submits individual details:
--   Individual : nationality, gender, occupation
--   Group      : formation date/country, purpose, number of members, the three
--                officials (chairperson / secretary / treasurer)
--   Corporate  : incorporation date/country, nature of business, principal
--                director / ultimate beneficial owner
--   Org (both) : authorised contact email
-- All columns are nullable and added idempotently -- safe to run more than once.
-- ---------------------------------------------------------------------------

alter table public.profiles
  -- Individual
  add column if not exists nationality           text,
  add column if not exists gender                text,
  add column if not exists occupation            text,
  -- Organisation (group + corporate)
  add column if not exists org_reg_date          text,
  add column if not exists org_reg_country       text,
  add column if not exists org_nature            text,
  add column if not exists contact_email         text,
  -- Group (Chama)
  add column if not exists member_count          integer,
  add column if not exists official_chairperson  text,
  add column if not exists official_secretary    text,
  add column if not exists official_treasurer    text,
  -- Corporate (Institution)
  add column if not exists beneficial_owner_name text,
  add column if not exists beneficial_owner_role text;

comment on column public.profiles.nationality           is 'Individual nationality / citizenship';
comment on column public.profiles.gender                is 'Individual gender (optional)';
comment on column public.profiles.occupation            is 'Individual occupation (optional)';
comment on column public.profiles.org_reg_date          is 'Group formation / company incorporation date (ISO yyyy-mm-dd)';
comment on column public.profiles.org_reg_country       is 'Country of registration / incorporation (groups & corporates)';
comment on column public.profiles.org_nature            is 'Group purpose / nature of business (groups & corporates)';
comment on column public.profiles.contact_email         is 'Authorised contact person email (groups & corporates)';
comment on column public.profiles.member_count          is 'Number of members in the group (Chama)';
comment on column public.profiles.official_chairperson  is 'Group chairperson name';
comment on column public.profiles.official_secretary    is 'Group secretary name';
comment on column public.profiles.official_treasurer    is 'Group treasurer name';
comment on column public.profiles.beneficial_owner_name is 'Principal director / ultimate beneficial owner (corporate)';
comment on column public.profiles.beneficial_owner_role is 'Beneficial owner role / title (corporate)';
