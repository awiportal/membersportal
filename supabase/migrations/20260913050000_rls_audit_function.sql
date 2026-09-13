-- #160: in-app RLS audit. A SECURITY DEFINER function that lists every base
-- table in the public schema with whether row-level security is enabled, whether
-- it is forced, and how many policies it has. It is read from the Admin/Chairlady
-- gated /staff/security page via the service-role admin client, so execute is
-- granted to service_role only (never anon/authenticated).
create or replace function public.rls_audit()
returns table (
  table_name   text,
  rls_enabled  boolean,
  force_rls    boolean,
  policy_count integer
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    c.relname::text,
    c.relrowsecurity,
    c.relforcerowsecurity,
    (select count(*)::int from pg_policy p where p.polrelid = c.oid)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
  order by c.relname;
$$;

revoke all on function public.rls_audit() from public;
grant execute on function public.rls_audit() to service_role;
