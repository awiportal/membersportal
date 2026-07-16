-- ============================================================================
-- AWIVEST Investor Portal — Supabase (PostgreSQL) schema
-- Version: v0.1 (DRAFT) — 16 Jul 2026
-- Derived from the AWIVEST Investor Portal Manual (v2.11.6 feature set).
-- Safe to run on a fresh Supabase project. Refine against the repo + flowcharts.
-- Principle: members see ONLY their own rows; admins see their organisation.
-- Secrets (service-role key, M-Pesa/PandaDoc/gateway keys) live in Edge Function
-- env vars — NEVER in this database and NEVER in client code.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
create type member_role      as enum ('member','admin','superadmin');
create type member_status    as enum ('pending','active','inactive','archived');
create type kyc_status        as enum ('pending','approved','rejected');
create type submission_status as enum ('draft','submitted','approved','rejected');
create type profile_status    as enum ('in_progress','submitted');
create type risk_profile      as enum ('conservative','moderate','balanced','growth','aggressive');
create type pay_method        as enum ('mpesa','card','bank');
create type pay_status        as enum ('pending','confirmed','failed','reversed');
create type dividend_status   as enum ('declared','paid');
create type doc_type          as enum ('statement','report','certificate','welfare_statement','guide','policy','onboarding','other');
create type agreement_status  as enum ('prepared','sent','opened','completed','declined');
create type claim_status      as enum ('pending','approved','rejected','paid');
create type opp_status        as enum ('open','closed','funded');

-- ---------------------------------------------------------------------------
-- ORGANISATIONS  (multi-entity ready — AWIVEST today, group later)
-- ---------------------------------------------------------------------------
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'African Women Investors',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PROFILES  (1:1 with auth.users; the member/investor record)
-- ---------------------------------------------------------------------------
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  org_id        uuid references organizations(id),                 -- set to the AWIVEST org via trigger/app (hardened in v0.2)
  investor_id   text unique,                       -- e.g. AWV-2026-0007 (generated server-side)
  full_name     text,
  email         text,
  phone         text,
  country       text default 'Kenya',
  role          member_role   not null default 'member',
  status        member_status not null default 'pending',
  kyc_status    kyc_status,
  joined_at     timestamptz,
  review_notified_at timestamptz,                  -- MSI annual-review automation
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Helper: is the current user an admin? (used by RLS below)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin','superadmin')
  );
$$;

-- ---------------------------------------------------------------------------
-- COMPLIANCE: KYC, forms, agreements, audit
-- ---------------------------------------------------------------------------
create table kyc_documents (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references profiles(id) on delete cascade,
  doc_type     text not null,
  file_path    text not null,                      -- Storage path (private bucket 'kyc')
  status       kyc_status not null default 'pending',
  comment      text,
  reviewed_by  uuid references profiles(id),
  uploaded_at  timestamptz not null default now(),
  reviewed_at  timestamptz
);

create table forms (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references organizations(id),
  title         text not null,
  description   text,
  fields        jsonb not null default '[]',       -- [{label,type,required,options}]
  require_signature boolean not null default false,
  status        text not null default 'active',
  sort_order    int not null default 0
);

create table form_submissions (
  id            uuid primary key default gen_random_uuid(),
  form_id       uuid not null references forms(id) on delete cascade,
  member_id     uuid not null references profiles(id) on delete cascade,
  answers       jsonb not null default '{}',
  signature_path text,
  status        submission_status not null default 'draft',
  comment       text,
  submitted_at  timestamptz,
  updated_at    timestamptz not null default now()
);

create table agreements (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references profiles(id) on delete cascade,
  template_id   text,
  provider      text default 'pandadoc',
  status        agreement_status not null default 'prepared',
  provider_ref  text,
  audit         jsonb,
  signed_at     timestamptz,
  created_at    timestamptz not null default now()
);

create table audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references profiles(id),
  member_id   uuid references profiles(id),
  action      text not null,                       -- e.g. 'kyc_approved','msi_review_due'
  meta        jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- FINANCIAL PROFILE (MSI) + GOALS
-- ---------------------------------------------------------------------------
create table financial_profiles (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references profiles(id) on delete cascade,
  status            profile_status not null default 'in_progress',
  answers           jsonb not null default '{}',   -- raw wizard answers (save-as-you-go)
  wellness_score    int,                           -- 0..100
  wellness_band     text,                           -- Excellent/Good/Average/Needs Improvement
  sub_scores        jsonb,                          -- {savings, emergency, debt, ...}
  risk_profile      risk_profile,
  mcis_score        int,                           -- 0..100
  mcis_tier         text,                           -- Explorer .. Strategic Partner
  life_stage_segment  text,                         -- Young Builder / Family Builder / ...
  standing_segment    text,                         -- Emerging Saver / ... / Established Investor
  recommendations   jsonb,
  planning_return   numeric(5,2) default 9.00,      -- illustrative % p.a. from risk profile
  consent_at        timestamptz,
  submitted_at      timestamptz,
  review_due_at     timestamptz,
  updated_at        timestamptz not null default now()
);

create table goals (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references profiles(id) on delete cascade,
  name               text not null,
  category           text,
  priority           text,
  target_amount      numeric(16,2) not null,
  saved_amount       numeric(16,2) not null default 0,
  target_date        date,
  projected_monthly  numeric(16,2),
  projected_rate     numeric(5,2),
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PORTFOLIO & MONEY
-- ---------------------------------------------------------------------------
create table holdings (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references profiles(id) on delete cascade,
  instrument   text not null,
  asset_class  text,
  value        numeric(16,2) not null default 0,
  weight       numeric(5,2),
  day_change   numeric(6,2),
  annual_return text,
  as_of        date default current_date
);

create table contributions (                        -- payments / M-Pesa / card / bank
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references profiles(id) on delete cascade,
  method        pay_method not null,
  provider      text,                               -- 'daraja' | 'flutterwave' | 'paystack' | 'dpo' | 'bank'
  provider_ref  text,                               -- e.g. M-Pesa receipt QGH7X2
  amount        numeric(16,2) not null,
  currency      text not null default 'KES',
  status        pay_status not null default 'pending',
  raw           jsonb,                              -- gateway callback payload (server-set)
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz
);

create table dividends (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references profiles(id) on delete cascade,
  source       text not null,
  period       text,
  amount       numeric(16,2) not null,
  status       dividend_status not null default 'declared',
  declared_at  timestamptz default now(),
  paid_at      timestamptz
);

create table documents (                            -- statements, reports, certificates, guides
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references organizations(id),
  member_id    uuid references profiles(id) on delete cascade,   -- null = shared with all
  title        text not null,
  type         doc_type not null default 'other',
  file_path    text not null,                       -- Storage path (private bucket 'documents')
  uploaded_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- COMMUNITY: welfare + opportunities
-- ---------------------------------------------------------------------------
create table welfare_enrollments (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references profiles(id) on delete cascade,
  status       text not null default 'active',
  enrolled_at  timestamptz not null default now()
);

create table welfare_claims (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references profiles(id) on delete cascade,
  claim_type   text not null,
  amount       numeric(16,2),
  doc_path     text,
  status       claim_status not null default 'pending',
  filed_at     timestamptz not null default now()
);

create table opportunities (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references organizations(id),
  name         text not null,
  asset_class  text,
  target_irr   text,
  min_amount   numeric(16,2),
  raised_pct   numeric(5,2) default 0,
  closes_at    date,
  description  text,
  status       opp_status not null default 'open'
);

create table opportunity_interests (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  member_id      uuid not null references profiles(id) on delete cascade,
  amount         numeric(16,2),
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- SYSTEM: notifications + settings
-- ---------------------------------------------------------------------------
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references profiles(id) on delete cascade,
  type         text,
  title        text not null,
  body         text,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

create table app_settings (                          -- non-secret config only
  id     uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  key    text not null,
  value  jsonb,
  unique (org_id, key)
);

-- ---------------------------------------------------------------------------
-- ROW-LEVEL SECURITY
-- Pattern: enable RLS on every table; members access own rows; admins access all.
-- ---------------------------------------------------------------------------
alter table profiles              enable row level security;
alter table kyc_documents         enable row level security;
alter table forms                 enable row level security;
alter table form_submissions      enable row level security;
alter table agreements            enable row level security;
alter table financial_profiles    enable row level security;
alter table goals                 enable row level security;
alter table holdings              enable row level security;
alter table contributions         enable row level security;
alter table dividends             enable row level security;
alter table documents             enable row level security;
alter table welfare_enrollments   enable row level security;
alter table welfare_claims        enable row level security;
alter table opportunities         enable row level security;
alter table opportunity_interests enable row level security;
alter table notifications         enable row level security;
alter table audit_log             enable row level security;

-- profiles: read/update self; admins everything
create policy profiles_self_read   on profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on profiles for all    using (public.is_admin()) with check (public.is_admin());

-- Generic per-member tables: owner or admin
create policy kyc_owner     on kyc_documents      for all using (member_id = auth.uid() or public.is_admin()) with check (member_id = auth.uid() or public.is_admin());
create policy subs_owner    on form_submissions   for all using (member_id = auth.uid() or public.is_admin()) with check (member_id = auth.uid() or public.is_admin());
create policy agr_owner     on agreements         for all using (member_id = auth.uid() or public.is_admin()) with check (member_id = auth.uid() or public.is_admin());
create policy fp_owner      on financial_profiles for all using (member_id = auth.uid() or public.is_admin()) with check (member_id = auth.uid() or public.is_admin());
create policy goals_owner   on goals              for all using (member_id = auth.uid() or public.is_admin()) with check (member_id = auth.uid() or public.is_admin());
create policy hold_owner    on holdings           for all using (member_id = auth.uid() or public.is_admin()) with check (member_id = auth.uid() or public.is_admin());
create policy contrib_read  on contributions      for select using (member_id = auth.uid() or public.is_admin());
create policy contrib_admin on contributions      for all    using (public.is_admin()) with check (public.is_admin()); -- writes via Edge Function/service role
create policy div_read      on dividends          for select using (member_id = auth.uid() or public.is_admin());
create policy div_admin     on dividends          for all    using (public.is_admin()) with check (public.is_admin());
create policy welf_e_owner  on welfare_enrollments for all using (member_id = auth.uid() or public.is_admin()) with check (member_id = auth.uid() or public.is_admin());
create policy welf_c_owner  on welfare_claims     for all using (member_id = auth.uid() or public.is_admin()) with check (member_id = auth.uid() or public.is_admin());
create policy opp_int_owner on opportunity_interests for all using (member_id = auth.uid() or public.is_admin()) with check (member_id = auth.uid() or public.is_admin());
create policy notif_owner   on notifications      for all using (member_id = auth.uid() or public.is_admin()) with check (member_id = auth.uid() or public.is_admin());

-- documents: shared (member_id null) OR owner OR admin
create policy docs_read on documents for select using (member_id is null or member_id = auth.uid() or public.is_admin());
create policy docs_admin on documents for all using (public.is_admin()) with check (public.is_admin());

-- forms & opportunities: readable by any authenticated member; writable by admin
create policy forms_read on forms for select using (auth.role() = 'authenticated');
create policy forms_admin on forms for all using (public.is_admin()) with check (public.is_admin());
create policy opp_read on opportunities for select using (auth.role() = 'authenticated');
create policy opp_admin on opportunities for all using (public.is_admin()) with check (public.is_admin());

-- audit_log: admins read; inserts by service role / Edge Functions
create policy audit_admin on audit_log for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- STORAGE (run in Supabase Storage or via SQL) — all PRIVATE buckets:
--   kyc, signatures, documents, claims
-- Access member files only through signed URLs generated server-side.
-- ---------------------------------------------------------------------------
-- insert into storage.buckets (id, name, public) values
--   ('kyc','kyc',false), ('signatures','signatures',false),
--   ('documents','documents',false), ('claims','claims',false);

-- ---------------------------------------------------------------------------
-- TRIGGERS (add next): auto-generate investor_id (AWV-YYYY-####),
-- maintain updated_at, and write audit_log rows on key actions.
-- ---------------------------------------------------------------------------
-- END v0.1
