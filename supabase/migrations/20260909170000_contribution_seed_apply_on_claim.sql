-- ============================================================================
-- AWIVEST Investor Portal — migration v1.20: apply a member's itemised
-- contribution history the moment she claims her fund record.
--
-- Context: contributions.member_id references profiles(id), i.e. a real login,
-- so a member's monthly payment ledger cannot be pre-loaded before she has an
-- account. Members self-register and then self-link their register row via
-- claim_membership() / staff_link_membership(), both of which set
-- member_finances.member_id through _do_membership_link().
--
-- This migration lets the office STAGE each member's itemised ledger keyed by
-- AWI register number (public.contribution_seed) ahead of time. When the
-- register row is linked to a login (member_id null -> set), an AFTER UPDATE
-- trigger copies that member's staged rows into public.contributions for the
-- claiming login. Idempotent throughout — safe to re-run and safe against a
-- re-link. The seed VALUES are loaded privately by the office (never committed
-- to this repo); this migration ships only the mechanism.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Staging table: itemised contribution history keyed by AWI register no.
--    RLS: staff-only. The definer functions below bypass RLS to apply rows to
--    a member the instant she links, so members never read the raw seed.
-- ---------------------------------------------------------------------------
create table if not exists public.contribution_seed (
  id            uuid primary key default gen_random_uuid(),
  member_no     text not null references public.member_finances(member_no) on delete cascade,
  period_label  text,                                   -- audit/display only, e.g. '2026-01'
  amount        numeric(16,2) not null,
  method        pay_method  not null default 'bank',
  provider      text,
  provider_ref  text not null,                          -- stable, e.g. 'AWI-001/2026-01' (drives idempotency)
  status        pay_status  not null default 'confirmed',
  confirmed_at  timestamptz,
  currency      text not null default 'KES',
  note          text,
  created_at    timestamptz not null default now()
);

-- One staged line per (member, reference).
create unique index if not exists contribution_seed_member_ref_uidx
  on public.contribution_seed (member_no, provider_ref);

alter table public.contribution_seed enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'contribution_seed'
       and policyname = 'contribution_seed_staff_all'
  ) then
    create policy contribution_seed_staff_all on public.contribution_seed
      for all using (public.is_staff()) with check (public.is_staff());
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2) Idempotency key on the live ledger: at most one contribution per
--    (member, reference). Lets the apply step use ON CONFLICT DO NOTHING so a
--    re-claim or a manual re-run never duplicates a member's history.
-- ---------------------------------------------------------------------------
create unique index if not exists contributions_member_ref_uidx
  on public.contributions (member_id, provider_ref)
  where provider_ref is not null;

-- ---------------------------------------------------------------------------
-- 3) Internal: copy one member's staged ledger into the live contributions
--    table for a given login. SECURITY DEFINER so it can write regardless of
--    the caller's RLS; locked down (execute revoked from PUBLIC) so only the
--    trigger and the staff wrapper below may invoke it.
-- ---------------------------------------------------------------------------
create or replace function public._apply_contribution_seed(p_uid uuid, p_member_no text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_uid is null or p_member_no is null then
    return 0;
  end if;

  with ins as (
    insert into public.contributions
      (member_id, method, provider, provider_ref, amount, currency, status, confirmed_at, created_at)
    select p_uid, s.method, s.provider, s.provider_ref, s.amount, s.currency, s.status,
           coalesce(s.confirmed_at, case when s.status = 'confirmed' then now() else null end),
           now()
      from public.contribution_seed s
     where s.member_no = p_member_no
    on conflict (member_id, provider_ref) where provider_ref is not null do nothing
    returning 1
  )
  select count(*) into v_count from ins;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public._apply_contribution_seed(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- 4) Trigger: when a register row is linked to a login (member_id null -> set,
--    by self-claim or staff), apply that member's staged ledger. Skips unlink
--    (member_id -> null) and no-op updates.
-- ---------------------------------------------------------------------------
create or replace function public.apply_contribution_seed_on_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.member_id is not null
     and (old.member_id is null or old.member_id is distinct from new.member_id) then
    perform public._apply_contribution_seed(new.member_id, new.member_no);
  end if;
  return new;
end;
$$;

drop trigger if exists member_finances_apply_seed on public.member_finances;
create trigger member_finances_apply_seed
  after update of member_id on public.member_finances
  for each row execute function public.apply_contribution_seed_on_link();

-- ---------------------------------------------------------------------------
-- 5) Staff backfill: apply staged ledgers to members who were ALREADY linked
--    before their seed was loaded (e.g. Agnes / AWI-001). Idempotent. Pass a
--    member_no to target one, or NULL for all currently-linked members.
--    is_staff()-gated inside; callable by signed-in staff.
-- ---------------------------------------------------------------------------
create or replace function public.apply_contribution_seed(p_member_no text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total integer := 0;
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;

  for r in
    select mf.member_id, mf.member_no
      from public.member_finances mf
     where mf.member_id is not null
       and (p_member_no is null or mf.member_no = p_member_no)
  loop
    v_total := v_total + public._apply_contribution_seed(r.member_id, r.member_no);
  end loop;

  return v_total;
end;
$$;

revoke all on function public.apply_contribution_seed(text) from public;
grant execute on function public.apply_contribution_seed(text) to authenticated;
