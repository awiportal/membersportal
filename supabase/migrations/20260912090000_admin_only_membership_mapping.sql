-- ============================================================================
-- AWIVEST — Admin-only membership mapping
--
-- Policy decision (12 Sep 2026): members must NOT self-link to a fund record.
-- An Admin (admin / Chairlady) maps each login to its AWIVEST register row after
-- verifying identity. This closes the risk that anyone who knows an un-onboarded
-- member's National ID (a semi-public number) could claim that member's fund
-- position and view their financials.
--
--   1) Revoke the member self-claim RPCs (the app no longer calls them; the
--      grants are removed so they cannot be invoked directly either).
--   2) Tighten staff link/unlink RPCs from is_staff() to is_admin(), so
--      Secretaries can no longer map/unmap fund records — only Admin/Chairlady.
--
-- Idempotent — safe to re-run. Apply BEFORE loading National IDs / phones into
-- member_finances.
-- ============================================================================

-- 1) DISABLE MEMBER SELF-CLAIM -----------------------------------------------
revoke execute on function public.claim_membership(text, text) from authenticated;
revoke execute on function public.claim_membership_by_national_id(text) from authenticated;

-- 2) ADMIN-ONLY LINK / UNLINK ------------------------------------------------
create or replace function public.staff_link_membership(p_member_no text, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.member_finances%rowtype;
begin
  if not public.is_admin() then
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
          jsonb_build_object('member_no', p_member_no, 'method', 'admin'));

  return jsonb_build_object('status', 'linked',
                            'member_no', v_row.member_no,
                            'full_name', v_row.full_name);
end;
$$;

create or replace function public.staff_unlink_membership(p_member_no text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev uuid;
begin
  if not public.is_admin() then
    return jsonb_build_object('status', 'error', 'reason', 'not_authorized');
  end if;

  select member_id into v_prev from public.member_finances where member_no = p_member_no;
  update public.member_finances
     set member_id = null, updated_at = now()
   where member_no = p_member_no;

  insert into public.audit_log (actor_id, member_id, action, meta)
  values (auth.uid(), v_prev, 'membership_unlinked',
          jsonb_build_object('member_no', p_member_no, 'method', 'admin'));

  return jsonb_build_object('status', 'unlinked', 'member_no', p_member_no);
end;
$$;

-- END
