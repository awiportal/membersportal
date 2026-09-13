-- #160 security hardening: make public.audit_log append-only (immutable).
--
-- audit_log already denies UPDATE/DELETE to anon/authenticated clients — its RLS
-- has only SELECT (staff/admin) and INSERT (staff) policies, so with RLS on, any
-- UPDATE/DELETE from a normal client is rejected by default. BUT the service
-- role (used by the server-side admin client) bypasses RLS entirely, so it could
-- still edit or remove historical audit rows.
--
-- This trigger is defense-in-depth: it blocks UPDATE and DELETE on audit_log for
-- EVERY caller, including the service role, so historical entries can never be
-- altered or removed — forensic / legal integrity. Nothing in the app updates or
-- deletes audit_log rows (all writes are INSERTs), so this is safe.
--
-- To correct an audit trail, append a new audit row rather than editing history.
-- (Emergency retention pruning, if ever needed, is a superuser maintenance task
-- performed by temporarily disabling this trigger.)

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'audit_log is append-only: % is not permitted on public.audit_log', tg_op
    using errcode = 'restrict_violation',
          hint = 'Historical audit entries are immutable; insert a new row instead.';
  return null;
end;
$$;

drop trigger if exists t_audit_log_immutable on public.audit_log;
create trigger t_audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.prevent_audit_log_mutation();
