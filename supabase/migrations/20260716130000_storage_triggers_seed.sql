-- ============================================================================
-- AWIVEST Investor Portal — migration v0.2
-- Runs after 20260716120000_init.sql.
-- Adds: seed organisation, Investor ID generation, new-user profile creation,
-- updated_at + audit triggers, and private Storage buckets with access policies.
-- ============================================================================

-- 1) Seed the AWIVEST organisation (fixed id) and make it the default org ----
insert into public.organizations (id, name)
values ('a0000000-0000-4000-8000-000000000001', 'African Women Investors')
on conflict (id) do nothing;

alter table public.profiles
  alter column org_id set default 'a0000000-0000-4000-8000-000000000001';

-- 2) Investor ID generator: AWV-YYYY-#### ------------------------------------
create sequence if not exists public.investor_seq start 1;

create or replace function public.next_investor_id()
returns text language sql volatile as $$
  select 'AWV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.investor_seq')::text, 4, '0');
$$;

-- 3) Auto-create a profile whenever a new auth user signs up -----------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone, org_id, investor_id, status, kyc_status, joined_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'a0000000-0000-4000-8000-000000000001',
    public.next_investor_id(),
    'pending',
    'pending',
    now()
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Maintain updated_at on tables that have it ------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger t_profiles_updated_at   before update on public.profiles           for each row execute function public.set_updated_at();
create trigger t_fp_updated_at         before update on public.financial_profiles for each row execute function public.set_updated_at();
create trigger t_subs_updated_at       before update on public.form_submissions   for each row execute function public.set_updated_at();

-- 5) Lightweight audit trail for member status changes -----------------------
create or replace function public.audit_profile_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    insert into public.audit_log (actor_id, member_id, action, meta)
    values (auth.uid(), new.id, 'member_status_changed',
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end; $$;

create trigger t_profiles_audit
  after update on public.profiles
  for each row execute function public.audit_profile_status();

-- 6) Private Storage buckets --------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('kyc','kyc',false),
  ('signatures','signatures',false),
  ('documents','documents',false),
  ('claims','claims',false)
on conflict (id) do nothing;

-- 7) Storage access policies --------------------------------------------------
-- Convention: member files live under a folder named by their user id, e.g.
--   kyc/<user_id>/national-id.pdf
-- Members manage files in their own folder; admins manage everything.
-- (Members receive shared documents via short-lived signed URLs generated
--  server-side, which run with the service role and bypass these policies.)
create policy "own or admin: read" on storage.objects for select
  using ( bucket_id in ('kyc','signatures','claims','documents')
          and ( (storage.foldername(name))[1] = auth.uid()::text or public.is_admin() ) );

create policy "own or admin: insert" on storage.objects for insert
  with check ( bucket_id in ('kyc','signatures','claims','documents')
               and ( (storage.foldername(name))[1] = auth.uid()::text or public.is_admin() ) );

create policy "own or admin: update" on storage.objects for update
  using ( bucket_id in ('kyc','signatures','claims','documents')
          and ( (storage.foldername(name))[1] = auth.uid()::text or public.is_admin() ) );

create policy "own or admin: delete" on storage.objects for delete
  using ( bucket_id in ('kyc','signatures','claims','documents')
          and ( (storage.foldername(name))[1] = auth.uid()::text or public.is_admin() ) );

-- END v0.2
