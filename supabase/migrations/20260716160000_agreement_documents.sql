-- ============================================================================
-- AWIVEST — migration v0.4: admin-managed membership agreements
--   * agreement_documents  : staff-published forms members must read & sign
--   * agreement_acceptances : each member's typed-name signature per form
--   * public 'agreements' storage bucket (blank templates; staff-write)
-- ============================================================================

-- Published agreement forms (managed by staff) ------------------------------
create table if not exists public.agreement_documents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default 'a0000000-0000-4000-8000-000000000001',
  title       text not null,
  description text,
  file_path   text not null,
  file_name   text,
  mime_type   text,
  required    boolean not null default true,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.agreement_documents enable row level security;

drop trigger if exists t_agreement_documents_updated_at on public.agreement_documents;
create trigger t_agreement_documents_updated_at
  before update on public.agreement_documents
  for each row execute function public.set_updated_at();

-- Members can read active forms; staff can read all and manage.
drop policy if exists agreement_docs_read  on public.agreement_documents;
create policy agreement_docs_read on public.agreement_documents
  for select using (active = true or public.is_staff());
drop policy if exists agreement_docs_write on public.agreement_documents;
create policy agreement_docs_write on public.agreement_documents
  for all using (public.is_staff()) with check (public.is_staff());

-- A member's signature (typed full name) against a form ----------------------
create table if not exists public.agreement_acceptances (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.profiles(id) on delete cascade,
  agreement_id uuid not null references public.agreement_documents(id) on delete cascade,
  signed_name  text not null,
  signed_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (member_id, agreement_id)
);
alter table public.agreement_acceptances enable row level security;

drop policy if exists agreement_acc_owner on public.agreement_acceptances;
create policy agreement_acc_owner on public.agreement_acceptances
  for all using (member_id = auth.uid() or public.is_staff())
  with check (member_id = auth.uid() or public.is_staff());

-- Public bucket for the blank agreement templates (no member data) ----------
insert into storage.buckets (id, name, public)
values ('agreements', 'agreements', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "agreements: staff insert" on storage.objects;
create policy "agreements: staff insert" on storage.objects
  for insert with check (bucket_id = 'agreements' and public.is_staff());
drop policy if exists "agreements: staff update" on storage.objects;
create policy "agreements: staff update" on storage.objects
  for update using (bucket_id = 'agreements' and public.is_staff());
drop policy if exists "agreements: staff delete" on storage.objects;
create policy "agreements: staff delete" on storage.objects
  for delete using (bucket_id = 'agreements' and public.is_staff());

-- END v0.4
