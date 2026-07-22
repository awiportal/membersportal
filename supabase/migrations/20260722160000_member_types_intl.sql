-- ---------------------------------------------------------------------------
-- Stage A: international, multi-type membership
-- Adds account type + international registration fields to profiles, and
-- teaches the sign-up trigger to copy them from the new member's metadata.
-- Idempotent: safe to run more than once.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists member_type    text not null default 'individual',
  add column if not exists dial_code       text,
  add column if not exists contact_person  text,
  add column if not exists contact_role    text;

-- Constrain account type to the four supported kinds.
alter table public.profiles drop constraint if exists profiles_member_type_check;
alter table public.profiles
  add constraint profiles_member_type_check
  check (member_type in ('individual','group','corporate','other'));

comment on column public.profiles.member_type    is 'individual | group | corporate | other';
comment on column public.profiles.dial_code       is 'International dialing code chosen at sign-up, e.g. +254';
comment on column public.profiles.contact_person  is 'Primary contact person (groups & corporates)';
comment on column public.profiles.contact_role    is 'Contact person role, optional (groups & corporates)';

-- Teach the sign-up trigger to persist the new registration fields.
-- (Same behaviour as before, plus dial_code / country / member_type /
--  contact_person / contact_role pulled from raw_user_meta_data.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (
    id, email, full_name, phone, dial_code, country,
    member_type, contact_person, contact_role,
    org_id, investor_id, status, kyc_status, joined_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'dial_code', ''),
    coalesce(nullif(new.raw_user_meta_data->>'country', ''), 'Kenya'),
    coalesce(nullif(new.raw_user_meta_data->>'member_type', ''), 'individual'),
    nullif(new.raw_user_meta_data->>'contact_person', ''),
    nullif(new.raw_user_meta_data->>'contact_role', ''),
    'a0000000-0000-4000-8000-000000000001',
    public.next_investor_id(),
    'pending',
    'pending',
    now()
  );
  return new;
end; $$;
