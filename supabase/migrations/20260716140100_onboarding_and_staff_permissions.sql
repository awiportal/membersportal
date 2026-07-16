-- ============================================================================
-- AWIVEST Investor Portal — migration v0.3b: onboarding data + staff perms
-- Runs after 20260716140000_add_secretary_role.sql.
--
-- Adds:
--   1) Personal-data fields on profiles (manual 3.3 "Enter personal data")
--   2) member_relations table (Next of kin / Beneficiary / Nominee)
--   3) is_staff() helper (secretary + admin + superadmin)
--   4) Broadened RLS so staff can run day-to-day operations, with a guard that
--      only Admin/Chairlady may change a member's ROLE, and only they may delete
--   5) Storage read access for staff (to review KYC files)
-- ============================================================================

-- 1) Personal-data fields on the member record ------------------------------
alter table public.profiles
  add column if not exists national_id      text,
  add column if not exists kra_pin          text,
  add column if not exists date_of_birth    date,
  add column if not exists postal_address   text,
  add column if not exists physical_address text,
  add column if not exists onboarding_step  text,        -- 'personal'|'documents'|'agreements'|'review'|'submitted'
  add column if not exists submitted_at      timestamptz; -- when the member submitted their pack for approval

-- 2) Next of kin / Beneficiary / Nominee (one of each per member) ------------
do $$ begin
  create type public.relation_kind as enum ('next_of_kin','beneficiary','nominee');
exception when duplicate_object then null; end $$;

create table if not exists public.member_relations (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.profiles(id) on delete cascade,
  relation_kind public.relation_kind not null,
  name          text,
  relationship  text,
  phone         text,
  id_number     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (member_id, relation_kind)
);

alter table public.member_relations enable row level security;

drop trigger if exists t_member_relations_updated_at on public.member_relations;
create trigger t_member_relations_updated_at
  before update on public.member_relations
  for each row execute function public.set_updated_at();

-- 3) Staff helper: secretary + admin + superadmin ----------------------------
--    (role cast to text so this is safe even if run alongside the enum change)
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('secretary','admin','superadmin')
  );
$$;
-- is_admin() stays as (admin, superadmin) for destructive / role-change actions.

-- 4) RLS -------------------------------------------------------------------

-- member_relations: owner or staff
drop policy if exists member_relations_owner on public.member_relations;
create policy member_relations_owner on public.member_relations
  for all using (member_id = auth.uid() or public.is_staff())
  with check (member_id = auth.uid() or public.is_staff());

-- profiles: self or staff read/update; insert self/staff; delete admin-only
drop policy if exists profiles_self_read   on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists profiles_admin_write on public.profiles;

create policy profiles_read on public.profiles
  for select using (id = auth.uid() or public.is_staff());
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());
create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid() or public.is_staff());
create policy profiles_delete on public.profiles
  for delete using (public.is_admin());

-- Guard: only Admin/Chairlady may change a member's ROLE. A logged-in Secretary
-- can approve (status change) but cannot elevate roles. Trusted server-side
-- (service role, auth.uid() is null) is allowed for programmatic role setup.
create or replace function public.guard_profile_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role)
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only an Admin or Chairlady can change a member''s role';
  end if;
  return new;
end; $$;

drop trigger if exists t_profiles_role_guard on public.profiles;
create trigger t_profiles_role_guard
  before update on public.profiles
  for each row execute function public.guard_profile_role_change();

-- Operational per-member tables: owner or staff
drop policy if exists kyc_owner     on public.kyc_documents;
create policy kyc_owner on public.kyc_documents
  for all using (member_id = auth.uid() or public.is_staff())
  with check (member_id = auth.uid() or public.is_staff());

drop policy if exists subs_owner    on public.form_submissions;
create policy subs_owner on public.form_submissions
  for all using (member_id = auth.uid() or public.is_staff())
  with check (member_id = auth.uid() or public.is_staff());

drop policy if exists agr_owner     on public.agreements;
create policy agr_owner on public.agreements
  for all using (member_id = auth.uid() or public.is_staff())
  with check (member_id = auth.uid() or public.is_staff());

drop policy if exists welf_e_owner  on public.welfare_enrollments;
create policy welf_e_owner on public.welfare_enrollments
  for all using (member_id = auth.uid() or public.is_staff())
  with check (member_id = auth.uid() or public.is_staff());

drop policy if exists welf_c_owner  on public.welfare_claims;
create policy welf_c_owner on public.welfare_claims
  for all using (member_id = auth.uid() or public.is_staff())
  with check (member_id = auth.uid() or public.is_staff());

drop policy if exists opp_int_owner on public.opportunity_interests;
create policy opp_int_owner on public.opportunity_interests
  for all using (member_id = auth.uid() or public.is_staff())
  with check (member_id = auth.uid() or public.is_staff());

-- Staff-managed shared tables
drop policy if exists docs_admin on public.documents;
create policy docs_staff on public.documents
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists div_admin on public.dividends;
create policy div_staff on public.dividends
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists contrib_admin on public.contributions;
create policy contrib_staff on public.contributions
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists forms_admin on public.forms;
create policy forms_staff on public.forms
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists opp_admin on public.opportunities;
create policy opp_staff on public.opportunities
  for all using (public.is_staff()) with check (public.is_staff());

-- audit_log: staff can read
drop policy if exists audit_admin on public.audit_log;
create policy audit_staff on public.audit_log
  for select using (public.is_staff());

-- 5) Storage: staff can read member files (to review KYC) --------------------
drop policy if exists "own or admin: read" on storage.objects;
create policy "own or staff: read" on storage.objects for select
  using ( bucket_id in ('kyc','signatures','claims','documents')
          and ( (storage.foldername(name))[1] = auth.uid()::text or public.is_staff() ) );

-- END v0.3b
