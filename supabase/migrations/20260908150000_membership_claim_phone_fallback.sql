-- ============================================================================
-- AWIVEST Investor Portal — migration v1.4: phone fallback for member linking
--
-- Extends v1.3 so a member whose National ID / Passport is not yet on file can
-- still self-link by her REGISTERED PHONE (the office already tracks phones for
-- M-Pesa). Matching order at onboarding is: National ID first, then phone.
--
--   * phone column on member_finances (normalised + uniquely indexed).
--   * norm_phone(text)          — last 9 significant digits, so "0719261277",
--                                 "+254719261277" and "254 719 261277" all match.
--   * _do_membership_link()     — internal helper (link + investor_id sync +
--                                 audit); LOCKED so only the definer functions
--                                 below can call it (never a member directly).
--   * claim_membership(nid, ph) — ID-then-phone self-claim (supersedes v1.3's
--                                 claim_membership_by_national_id, kept as a
--                                 thin wrapper for compatibility).
--
-- Idempotent. Phone values are production PII — loaded privately by the office
-- (see the staff Fund Records screen), never seeded into this public repo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Phone normaliser: strip to digits, keep the last 9 (Kenyan MSISDN core).
--    Returns null when there are fewer than 9 digits. IMMUTABLE for indexing.
-- ---------------------------------------------------------------------------
create or replace function public.norm_phone(p text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g')) >= 9
      then right(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 9)
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Phone match key on the fund record (values loaded privately by the office).
-- ---------------------------------------------------------------------------
alter table public.member_finances
  add column if not exists phone text;

comment on column public.member_finances.phone is
  'Member registered / M-Pesa phone, used as a fallback to self-link a portal '
  'login to this fund record when no National ID is on file. Production PII — '
  'loaded privately by the office, never committed to the repo.';

create unique index if not exists member_finances_phone_uidx
  on public.member_finances (public.norm_phone(phone))
  where phone is not null and btrim(phone) <> '';

-- ---------------------------------------------------------------------------
-- 2) Internal link helper. SECURITY DEFINER; performs the guarded link, adopts
--    the AWI register number as the visible investor_id, and audits. LOCKED
--    DOWN: execute is revoked from PUBLIC so a member can never call it with an
--    arbitrary fund-record id — only the claim_* definer functions (which run
--    as the owner) may invoke it after they have verified a match.
-- ---------------------------------------------------------------------------
create or replace function public._do_membership_link(p_uid uuid, p_finance_id uuid, p_method text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.member_finances%rowtype;
begin
  update public.member_finances
     set member_id = p_uid, updated_at = now()
   where id = p_finance_id
     and member_id is null          -- guard against a concurrent claim
  returning * into v_row;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  begin
    update public.profiles set investor_id = v_row.member_no where id = p_uid;
  exception when unique_violation then
    null;
  end;

  insert into public.audit_log (actor_id, member_id, action, meta)
  values (p_uid, p_uid, 'membership_linked',
          jsonb_build_object('member_no', v_row.member_no, 'method', p_method));

  return jsonb_build_object('status', 'linked',
                            'member_no', v_row.member_no,
                            'full_name', v_row.full_name);
end;
$$;

revoke all on function public._do_membership_link(uuid, uuid, text) from public;

-- ---------------------------------------------------------------------------
-- 3) Member self-claim: National ID first, then registered phone.
-- ---------------------------------------------------------------------------
create or replace function public.claim_membership(p_national_id text, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_nid   text := public.norm_identity(p_national_id);
  v_phone text := public.norm_phone(p_phone);
  v_id    uuid;
  v_row   public.member_finances%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'error', 'reason', 'not_authenticated');
  end if;

  -- Idempotent: if already linked, report the existing record.
  select * into v_row from public.member_finances where member_id = v_uid limit 1;
  if found then
    return jsonb_build_object('status', 'already_linked',
                              'member_no', v_row.member_no,
                              'full_name', v_row.full_name);
  end if;

  -- 1) National ID / Passport
  if v_nid is not null then
    select id into v_id
      from public.member_finances
     where member_id is null
       and public.norm_identity(national_id) = v_nid
     limit 1;
    if v_id is not null then
      return public._do_membership_link(v_uid, v_id, 'self_national_id');
    end if;
  end if;

  -- 2) Fallback: registered phone
  if v_phone is not null then
    select id into v_id
      from public.member_finances
     where member_id is null
       and public.norm_phone(phone) = v_phone
     limit 1;
    if v_id is not null then
      return public._do_membership_link(v_uid, v_id, 'self_phone');
    end if;
  end if;

  return jsonb_build_object('status', 'not_found');
end;
$$;

grant execute on function public.claim_membership(text, text) to authenticated;

-- Keep v1.3's entry point working: delegate to the combined matcher.
create or replace function public.claim_membership_by_national_id(p_national_id text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.claim_membership(p_national_id, null);
$$;

grant execute on function public.claim_membership_by_national_id(text) to authenticated;

-- END v1.4
