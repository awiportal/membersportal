-- ============================================================================
-- AWIVEST — migration v0.5: identity uniqueness (email / phone / national ID)
--   * Unique indexes so the same National ID or phone cannot be registered
--     twice. (Email uniqueness is already enforced by Supabase Auth.)
--   * identifier_in_use(): SECURITY DEFINER helper for the live "already in
--     use" checks on the onboarding form. Returns only a boolean — it never
--     exposes another member's data.
--
--   NOTE: if this fails with "could not create unique index ... duplicate key",
--   two existing rows already share a National ID or phone. Fix or clear the
--   duplicate values, then re-run.
-- ============================================================================

-- Case-insensitive unique National ID / Passport number (blank/null ignored).
create unique index if not exists profiles_national_id_uidx
  on public.profiles (lower(btrim(national_id)))
  where national_id is not null and btrim(national_id) <> '';

-- Unique phone number (blank/null ignored).
create unique index if not exists profiles_phone_uidx
  on public.profiles (btrim(phone))
  where phone is not null and btrim(phone) <> '';

-- Boolean: "is this identifier already used by a DIFFERENT member?"
-- SECURITY DEFINER so it can see across members, but returns only true/false.
create or replace function public.identifier_in_use(p_field text, p_value text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v   text := btrim(coalesce(p_value, ''));
  me  uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  n   int  := 0;
begin
  if v = '' then
    return false;
  end if;

  if p_field = 'national_id' then
    select count(*) into n from public.profiles
      where national_id is not null
        and lower(btrim(national_id)) = lower(v)
        and id <> me;
  elsif p_field = 'phone' then
    select count(*) into n from public.profiles
      where phone is not null
        and btrim(phone) = v
        and id <> me;
  elsif p_field = 'kra_pin' then
    select count(*) into n from public.profiles
      where kra_pin is not null
        and lower(btrim(kra_pin)) = lower(v)
        and id <> me;
  else
    return false;
  end if;

  return n > 0;
end;
$$;

grant execute on function public.identifier_in_use(text, text) to authenticated;

-- END v0.5
