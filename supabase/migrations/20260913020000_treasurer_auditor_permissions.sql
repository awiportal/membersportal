-- ============================================================================
-- AWIVEST — Treasurer + Auditor permissions (#155)
--   Treasurer becomes a full staff operator (added to is_staff()).
--   Auditor is a READ-ONLY governance role: it is deliberately NOT in
--   is_staff() (so it gets no write access), and instead receives a SELECT-only
--   policy on every RLS-enabled table via is_auditor().
-- ============================================================================

-- Treasurer joins the staff operators. Auditor is intentionally excluded here.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('secretary','treasurer','admin','superadmin')
  );
$$;

-- Read-only auditor predicate.
create or replace function public.is_auditor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'auditor'
  );
$$;

-- Grant the auditor SELECT-only access to every RLS-enabled table in public.
-- Additive permissive policy named auditor_read; drop-if-exists makes it
-- idempotent. No INSERT/UPDATE/DELETE policy is created for the auditor, so the
-- role can read everything and write nothing. New tables added by later
-- migrations should include their own auditor_read policy (or re-run this block).
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity = true
  loop
    execute format('drop policy if exists auditor_read on public.%I', r.relname);
    execute format('create policy auditor_read on public.%I for select using (public.is_auditor())', r.relname);
  end loop;
end $$;

-- END Treasurer + Auditor permissions
