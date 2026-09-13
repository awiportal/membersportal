-- #162: dormant membership status + exit-settlement records for departing members.
-- Apply this migration BEFORE deploying the code that uses it.

-- 1) Add 'dormant' to the membership status enum (member_status on profiles.status).
--    Idempotent; not referenced elsewhere in this file so it is safe in one txn.
alter type member_status add value if not exists 'dormant';

-- 2) Exit-settlement records. One formal settlement document per departing member,
--    with its own lifecycle (draft -> approved -> paid, or cancelled). This is a
--    RECORD only: it does not move fund money (the withdrawals / fund-data flow is
--    the authoritative source for member_finances balances).
create table if not exists public.exit_settlements (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid not null references public.profiles(id) on delete cascade,
  status              text not null default 'draft' check (status in ('draft','approved','paid','cancelled')),
  gross_entitlement   numeric(14,2) not null default 0,
  amount_already_paid numeric(14,2) not null default 0,
  deductions          numeric(14,2) not null default 0,
  net_payable         numeric(14,2) not null default 0,
  reason              text,
  method              text,
  reference           text,
  notes               text,
  initiated_by        uuid references public.profiles(id),
  approved_by         uuid references public.profiles(id),
  paid_by             uuid references public.profiles(id),
  initiated_at        timestamptz not null default now(),
  approved_at         timestamptz,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists exit_settlements_member_idx on public.exit_settlements(member_id);
create index if not exists exit_settlements_status_idx on public.exit_settlements(status);

alter table public.exit_settlements enable row level security;

-- Staff (and the read-only Auditor) may read; only staff (is_staff() excludes the
-- auditor) may write. Server actions additionally enforce segregated duties.
drop policy if exists exit_settlements_staff_read on public.exit_settlements;
create policy exit_settlements_staff_read on public.exit_settlements
  for select using (public.is_staff() or public.is_auditor());

drop policy if exists exit_settlements_staff_write on public.exit_settlements;
create policy exit_settlements_staff_write on public.exit_settlements
  for all using (public.is_staff()) with check (public.is_staff());
