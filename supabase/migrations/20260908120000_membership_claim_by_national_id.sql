-- ============================================================================
-- AWIVEST Investor Portal — migration v1.3: link members to their fund record
-- by National ID / Passport number
--
-- The 48 fund positions in public.member_finances are keyed by AWIVEST register
-- number (AWI-001 .. AWI-048), NOT by a portal login, and were loaded before
-- members had accounts (member_finances.member_id is NULL for every row).
-- We have no member emails, so accounts are self-registered: at sign-up
-- Supabase Auth mints a RANDOM uuid (profiles.id = auth.users.id) that has no
-- relationship to any AWI number, and handle_new_user() gives a cosmetic
-- investor_id (AWV-YYYY-####). The one missing piece is the ACT of setting
-- member_finances.member_id so the existing owner-read RLS policy
-- (member_id = auth.uid()) starts serving each member her own row.
--
-- This migration adds that piece, using National ID / Passport number as the
-- match key (already collected at onboarding, already uniquely indexed on
-- profiles):
--   * national_id column on member_finances (normalised + uniquely indexed).
--     The actual ID VALUES are production PII and MUST be loaded privately by
--     the office (Supabase SQL editor / staff screen) — never seeded into this
--     public repo (see AGENTS.md "no production PII").
--   * norm_identity(text)               — shared, punctuation/space-insensitive
--                                          normaliser (uppercase, alnum only).
--   * claim_membership_by_national_id() — member self-links during onboarding
--                                          by entering her ID; verified server
--                                          side; links the single unclaimed
--                                          matching row to auth.uid().
--   * staff_link_membership()           — office confirm/override from the
--     staff_unlink_membership()           member console; is_staff()-gated.
--
-- All writes are audited to public.audit_log. Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Shared identity normaliser (uppercase, strip everything but A-Z0-9).
--    IMMUTABLE so it can back a unique index. Handles "12345678",
--    "1234 5678", "a01234567" entered inconsistently by members/office.
-- ---------------------------------------------------------------------------
create or replace function public.norm_identity(p text)
returns text
language sql
immutable
as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

-- ---------------------------------------------------------------------------
-- 1) Match key on the fund record. Values are loaded privately by the office.
-- ---------------------------------------------------------------------------
alter table public.member_finances
  add column if not exists national_id text;

comment on column public.member_finances.national_id is
  'Member National ID / Passport number used to self-link a portal login to '
  'this fund record. Production PII — loaded privately by the office, never '
  'committed to the repo.';

-- One fund record per National ID (blank/null ignored). Prevents two register
-- rows sharing an ID, which would make the match ambiguous.
create unique index if not exists member_finances_national_id_uidx
  on public.member_finances (public.norm_identity(national_id))
  where national_id is not null and btrim(national_id) <> '';

-- ---------------------------------------------------------------------------
-- 2) Member self-claim (onboarding). SECURITY DEFINER so a still-"pending"
--    member can link her row through this function even though RLS forbids her
--    from updating member_finances directly. Returns only a small status blob —
--    never another member's figures.
-- ---------------------------------------------------------------------------
create or replace function public.claim_membership_by_national_id(p_national_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_norm text := public.norm_identity(p_national_id);
  v_row  public.member_finances%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'error', 'reason', 'not_authenticated');
  end if;
  if v_norm is null then
    return jsonb_build_object('status', 'error', 'reason', 'blank_id');
  end if;

  -- Idempotent: if this login is already linked, report the existing record.
  select * into v_row from public.member_finances where member_id = v_uid limit 1;
  if found then
    return jsonb_build_object('status', 'already_linked',
                              'member_no', v_row.member_no,
                              'full_name', v_row.full_name);
  end if;

  -- Find the single UNCLAIMED fund record whose National ID matches.
  select * into v_row
    from public.member_finances
   where member_id is null
     and public.norm_identity(national_id) = v_norm
   limit 1;
  if not found then
    -- No record carries this ID yet, or it is already claimed by someone else.
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Link it — but only if still unclaimed (guards a concurrent claim race).
  update public.member_finances
     set member_id = v_uid, updated_at = now()
   where id = v_row.id
     and member_id is null;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Show one consistent number across the portal: adopt the AWI register no.
  -- as the visible investor_id. If it somehow collides, keep the auto AWV id.
  begin
    update public.profiles set investor_id = v_row.member_no where id = v_uid;
  exception when unique_violation then
    null;
  end;

  insert into public.audit_log (actor_id, member_id, action, meta)
  values (v_uid, v_uid, 'membership_linked',
          jsonb_build_object('member_no', v_row.member_no, 'method', 'self_national_id'));

  return jsonb_build_object('status', 'linked',
                            'member_no', v_row.member_no,
                            'full_name', v_row.full_name);
end;
$$;

grant execute on function public.claim_membership_by_national_id(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Office confirm / override from the staff member console. is_staff()-gated.
-- ---------------------------------------------------------------------------
create or replace function public.staff_link_membership(p_member_no text, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.member_finances%rowtype;
begin
  if not public.is_staff() then
    return jsonb_build_object('status', 'error', 'reason', 'not_authorized');
  end if;
  if coalesce(btrim(p_member_no), '') = '' or p_member_id is null then
    return jsonb_build_object('status', 'error', 'reason', 'missing_args');
  end if;

  select * into v_row from public.member_finances where member_no = p_member_no;
  if not found then
    return jsonb_build_object('status', 'error', 'reason', 'no_such_member_no');
  end if;

  -- One login may own only one fund record.
  if exists (select 1 from public.member_finances
              where member_id = p_member_id and member_no <> p_member_no) then
    return jsonb_build_object('status', 'error', 'reason', 'login_already_linked');
  end if;

  update public.member_finances
     set member_id = p_member_id, updated_at = now()
   where member_no = p_member_no;

  begin
    update public.profiles set investor_id = p_member_no where id = p_member_id;
  exception when unique_violation then
    null;
  end;

  insert into public.audit_log (actor_id, member_id, action, meta)
  values (auth.uid(), p_member_id, 'membership_linked',
          jsonb_build_object('member_no', p_member_no, 'method', 'staff'));

  return jsonb_build_object('status', 'linked',
                            'member_no', v_row.member_no,
                            'full_name', v_row.full_name);
end;
$$;

grant execute on function public.staff_link_membership(text, uuid) to authenticated;

create or replace function public.staff_unlink_membership(p_member_no text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev uuid;
begin
  if not public.is_staff() then
    return jsonb_build_object('status', 'error', 'reason', 'not_authorized');
  end if;

  select member_id into v_prev from public.member_finances where member_no = p_member_no;
  update public.member_finances
     set member_id = null, updated_at = now()
   where member_no = p_member_no;

  insert into public.audit_log (actor_id, member_id, action, meta)
  values (auth.uid(), v_prev, 'membership_unlinked',
          jsonb_build_object('member_no', p_member_no, 'method', 'staff'));

  return jsonb_build_object('status', 'unlinked', 'member_no', p_member_no);
end;
$$;

grant execute on function public.staff_unlink_membership(text) to authenticated;

-- END v1.3
