-- ============================================================================
-- AWIVEST Investor Portal — #154 (code half): automated contribution receipts
-- and deposit-deadline reminders. Email only — SMS is explicitly out of scope.
--
-- Ships the persistent state the /api/cron/notifications route needs:
--   1) contributions.receipt_sent_at  — per-row "receipt already emailed" flag,
--      so a receipt is never double-sent. EXISTING rows are backfilled as
--      already-receipted so historical/seeded ledgers never trigger a receipt
--      blast; only contributions recorded AFTER this migration earn a receipt.
--   2) _apply_contribution_seed(...)   — the seed-apply path (fires when a member
--      links her register row) is updated to stamp receipt_sent_at = now() on the
--      rows it copies in, so a member claiming her account is NOT emailed a
--      receipt for every historical line of her back-loaded ledger.
--   3) notification_state              — dedup ledger for deadline reminders, so
--      each member is reminded at most once per monthly deadline period.
--   4) app_settings seeds             — configurable deadline + toggles (text
--      values, read by the cron). Reminders default OFF so nothing mass-emails
--      real members until staff deliberately enable it.
--
-- receipt_sent_at is a NEW column, so writing it does NOT trip the ledger
-- column-immutability trigger (that guards amount/currency/member_id/method/
-- provider/provider_ref/created_at only) — see 20260913070000. contributions is
-- not covered by the member_finances/welfare_claims change-log trigger either,
-- so stamping receipts adds no audit_log noise.
--
-- Additive + idempotent — safe to re-run.
-- ============================================================================

-- 1) receipt_sent_at + one-time backfill -------------------------------------
--    The ADD + backfill run only on the apply that first creates the column, so
--    re-running this migration never re-stamps (which would suppress a genuine
--    pending receipt). Every contribution that already exists at first apply is
--    marked receipted; new contributions start NULL and earn a real receipt.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contributions'
      and column_name = 'receipt_sent_at'
  ) then
    alter table public.contributions add column receipt_sent_at timestamptz;
    update public.contributions set receipt_sent_at = now();
  end if;
end $$;

comment on column public.contributions.receipt_sent_at is
  '#154: when the automated email receipt for this contribution was sent (NULL = not yet). Existing rows were backfilled as already-sent at migration time so historical/seeded ledgers are never re-receipted.';

-- 2) Seed-apply stamps receipts as already sent ------------------------------
--    Redefinition of the function from 20260909170000. The ONLY change is the
--    added receipt_sent_at = now() on the INSERT: contributions copied in when a
--    member links her register row are born already-receipted, so linking never
--    blasts a member with a receipt per historical line. Real-time payments
--    recorded through other paths still start NULL and earn a receipt.
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
      (member_id, method, provider, provider_ref, amount, currency, status, confirmed_at, created_at, receipt_sent_at)
    select p_uid, s.method, s.provider, s.provider_ref, s.amount, s.currency, s.status,
           coalesce(s.confirmed_at, case when s.status = 'confirmed' then now() else null end),
           now(),
           now()   -- #154: seeded/back-loaded history is not a live payment event; mark receipted
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

-- 3) Reminder dedup ledger ---------------------------------------------------
create table if not exists public.notification_state (
  notif_key text primary key,           -- e.g. 'contribution_reminder:AWI-001:2026-09'
  sent_at   timestamptz not null default now(),
  meta      jsonb
);

alter table public.notification_state enable row level security;
-- No policies: written only by the service-role cron client, never by clients.

-- 4) Configurable deadline + toggles (app_settings is text-valued) -----------
--    Read by the notifications cron. Reminders default OFF so enabling them is a
--    deliberate staff action, not a deploy-time surprise to 48 real members.
insert into public.app_settings (key, value) values
  ('contribution_receipts_enabled',  'true'),   -- per-payment receipts (low volume) on by default
  ('contribution_reminders_enabled', 'false'),  -- monthly mass reminder OFF until staff enable it
  ('contribution_deadline_day',      '5'),      -- day-of-month the monthly deposit is due
  ('contribution_reminder_lead_days','3')       -- send the reminder this many days before the deadline
on conflict (key) do nothing;

-- END #154 auto notifications
