-- Financial ledger column immutability -- partial hardening for #182.
--
-- The full issue #182 is an architectural change (migrate the member_finances
-- snapshot to an append-only ledger with offsetting-entry corrections, and a
-- scoped superadmin override for migrations). That design decision is deferred
-- to the maintainers and is intentionally NOT attempted here.
--
-- This migration ships the safe, non-breaking first step. The two tables that
-- are ALREADY insert-only in the application -- contributions and withdrawals
-- -- get a BEFORE UPDATE trigger that locks their money-identity columns, so a
-- recorded amount, its attribution, or its date can never be silently altered.
-- The trigger fires for every caller including the service role, because
-- triggers are not bypassed by RLS.
--
-- Deliberately NOT included, to avoid breaking current behaviour:
--   * No DELETE block. profiles.id ON DELETE CASCADE -> contributions and
--     ON DELETE SET NULL -> withdrawals.member_id must keep working, and the
--     member-deletion / correction-by-reversal policy is part of the #182
--     design decision, not this increment.
--   * Lifecycle columns stay editable. contributions.status / confirmed_at /
--     raw remain writable so the future M-Pesa (Daraja, #161) confirmation
--     callback can still mark a pending payment confirmed.
--   * Annotation columns stay editable. withdrawals.method / reference / note
--     can be corrected (e.g. a mistyped M-Pesa reference).
--   * member_finances (snapshot re-import) and welfare_claims (claim-status
--     workflow) are intentionally left fully mutable. Tamper-evident change
--     logging for those is a separate follow-up.
--
-- To run a controlled data migration or correction, a superadmin can briefly:
--   alter table public.<table> disable trigger <trigger>;  -- fix rows --
--   alter table public.<table> enable  trigger <trigger>;

create or replace function public.enforce_ledger_column_immutability()
returns trigger
language plpgsql
as $$
declare
  changed text := null;
begin
  if tg_table_name = 'contributions' then
    if    new.amount       is distinct from old.amount       then changed := 'amount';
    elsif new.currency     is distinct from old.currency     then changed := 'currency';
    elsif new.member_id    is distinct from old.member_id    then changed := 'member_id';
    elsif new.method       is distinct from old.method       then changed := 'method';
    elsif new.provider     is distinct from old.provider     then changed := 'provider';
    elsif new.provider_ref is distinct from old.provider_ref then changed := 'provider_ref';
    elsif new.created_at   is distinct from old.created_at   then changed := 'created_at';
    end if;
  elsif tg_table_name = 'withdrawals' then
    if    new.amount      is distinct from old.amount      then changed := 'amount';
    elsif new.member_no   is distinct from old.member_no   then changed := 'member_no';
    elsif new.occurred_at is distinct from old.occurred_at then changed := 'occurred_at';
    elsif new.recorded_by is distinct from old.recorded_by then changed := 'recorded_by';
    elsif new.created_at  is distinct from old.created_at  then changed := 'created_at';
    end if;
  end if;

  if changed is not null then
    raise exception
      'Column "%" on public.% is immutable: recorded financial entries are append-only. Correct it with a new offsetting entry, not by editing this row (id=%).',
      changed, tg_table_name, old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists t_contributions_columns_immutable on public.contributions;
create trigger t_contributions_columns_immutable
  before update on public.contributions
  for each row execute function public.enforce_ledger_column_immutability();

drop trigger if exists t_withdrawals_columns_immutable on public.withdrawals;
create trigger t_withdrawals_columns_immutable
  before update on public.withdrawals
  for each row execute function public.enforce_ledger_column_immutability();

comment on function public.enforce_ledger_column_immutability() is
  'Partial #182: locks money-identity columns on contributions/withdrawals against UPDATE (fires for all callers incl. service role). Lifecycle/annotation columns stay editable; DELETE is not blocked. See migration header for the deferred architectural scope.';
