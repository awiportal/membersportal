-- Tamper-evident change logging for the mutable financial tables (#182, Option A).
--
-- member_finances (a snapshot re-imported by staff) and welfare_claims (a
-- claim-status workflow) are intentionally left editable -- see #185, which
-- only locked the insert-only ledger tables. To make those edits provable
-- without changing the workflow, every UPDATE and DELETE on these two tables is
-- now recorded to audit_log, which is itself append-only (#174). Result: an
-- edit can still happen, but it can never happen silently or be erased.
--
-- Each log row captures:
--   actor_id  = auth.uid() (the staff user; null for service-role writes),
--   member_id = the row's member_id (null allowed on member_finances),
--   action    = '<table>.update' | '<table>.delete',
--   meta      = { table, op, row_id, member_no, changed:{col:{old,new}} }  for UPDATE
--               { table, op, row_id, member_no, deleted_row:{...} }         for DELETE
--
-- SECURITY DEFINER so the audit INSERT always succeeds regardless of the
-- caller's audit_log INSERT privilege; auth.uid() still reflects the caller's
-- JWT inside a definer function, so the actor is captured correctly.

create or replace function public.log_financial_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_member uuid;
  v_diff   jsonb;
  v_meta   jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(o.k, jsonb_build_object('old', o.v, 'new', n.v))
      into v_diff
      from jsonb_each(to_jsonb(old)) as o(k, v)
      join jsonb_each(to_jsonb(new)) as n(k, v) on n.k = o.k
     where o.v is distinct from n.v;

    if v_diff is null then
      return null;                 -- no column actually changed; skip the no-op
    end if;

    v_member := new.member_id;
    v_meta := jsonb_build_object(
      'table', tg_table_name,
      'op', 'update',
      'row_id', to_jsonb(new) ->> 'id',
      'member_no', to_jsonb(new) ->> 'member_no',   -- null for welfare_claims
      'changed', v_diff
    );
  else  -- DELETE
    v_member := old.member_id;
    v_meta := jsonb_build_object(
      'table', tg_table_name,
      'op', 'delete',
      'row_id', to_jsonb(old) ->> 'id',
      'member_no', to_jsonb(old) ->> 'member_no',
      'deleted_row', to_jsonb(old)
    );
  end if;

  insert into public.audit_log (actor_id, member_id, action, meta)
  values (v_actor, v_member, tg_table_name || '.' || lower(tg_op), v_meta);

  return null;                     -- AFTER trigger: return value is ignored
end;
$$;

comment on function public.log_financial_record_change() is
  'Option A of #182: records every UPDATE/DELETE on member_finances and welfare_claims to the append-only audit_log (#174), with a per-column diff and the acting user. Tamper-evident without blocking the snapshot/status workflows.';

drop trigger if exists t_member_finances_change_log on public.member_finances;
create trigger t_member_finances_change_log
  after update or delete on public.member_finances
  for each row execute function public.log_financial_record_change();

drop trigger if exists t_welfare_claims_change_log on public.welfare_claims;
create trigger t_welfare_claims_change_log
  after update or delete on public.welfare_claims
  for each row execute function public.log_financial_record_change();
