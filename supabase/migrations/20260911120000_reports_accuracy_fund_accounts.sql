-- ============================================================================
-- AWIVEST Investor Portal — Reports accuracy, fund accounts, Info Center fix
--
-- Fixes three live issues found on 11 Sep 2026:
--   1) Information Center posting silently failed — the `announcements` table
--      did not exist in the live database (its migration was never applied).
--   2) Fund-data "Post contribution" / "Record withdrawal" silently failed —
--      member_finances was missing the tracking columns the console writes to.
--   3) Reports figures were wrong — the register held per-member TOTALs rounded
--      to whole shillings, the two non-member fund accounts (Membership fees,
--      Welfare) were absent, and AWI-007's withdrawal was stored negative.
--
-- Authoritative source: "AWI Final Compiled Statement 2018 - Jul 2026 (excl
-- exits)". After this migration:
--   * Grand fund TOTAL (incl. Membership fees + Welfare)      = 119,939,314.29
--   * TOTAL excluding the two exits (AWI-007, AWI-022)        = 105,865,369.74
--   * Exits: AWI-007 Lydia Kasera 6,208,245.71; AWI-022 Nelly Opiyo 7,865,698.84
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- 1) INFORMATION CENTER -------------------------------------------------------
create table if not exists public.announcements (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references public.organizations(id),
  category       text not null default 'announcement'
                   check (category in ('announcement','news','event','update')),
  title          text not null,
  body           text not null default '',
  link_url       text,
  event_at       timestamptz,
  event_location text,
  pinned         boolean not null default false,
  published      boolean not null default false,
  published_at   timestamptz,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.announcements enable row level security;

drop trigger if exists t_announcements_updated_at on public.announcements;
create trigger t_announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select using (published = true or public.is_staff());

drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements
  for all using (public.is_staff()) with check (public.is_staff());

create index if not exists idx_announcements_feed
  on public.announcements (published, published_at desc);

drop policy if exists audit_staff_insert on public.audit_log;
create policy audit_staff_insert on public.audit_log
  for insert with check (public.is_staff());

-- 2) FUND-DATA COLUMNS --------------------------------------------------------
-- Document the compiled-statement columns already loaded into the live DB and
-- add the three tracking columns the fund-data console writes to (their absence
-- made every "Post contribution" / "Record withdrawal" silently fail).
alter table public.member_finances
  add column if not exists lifetime_contributions numeric(16,2),
  add column if not exists interest_2018_2023     numeric(16,2),
  add column if not exists britam_interest_life   numeric(16,2),
  add column if not exists jubilee_mmf            numeric(16,2),
  add column if not exists jubilee_fif            numeric(16,2),
  add column if not exists jubilee_fif_apr_jul    numeric(16,2),
  add column if not exists withdrawal             numeric(16,2),
  add column if not exists sched_2026             jsonb,
  add column if not exists sched_2026_posted      jsonb,
  add column if not exists withdrawal_at          timestamptz,
  add column if not exists last_posted_at         timestamptz;

-- 3a) PRECISE PER-MEMBER TOTALS ----------------------------------------------
-- Restore each member's TOTAL to the authoritative compiled statement, to the
-- cent (the register previously held whole-shilling roundings). current_balance
-- and net_balance both carry the member's total holding in the fund.
update public.member_finances as m
   set current_balance = v.total,
       net_balance     = v.total,
       updated_at      = now()
  from (values
  ('AWI-001', 9700565.97),
  ('AWI-002', 3589461.91),
  ('AWI-003', 8883965.84),
  ('AWI-004', 5223026.74),
  ('AWI-005', 9472987.53),
  ('AWI-006', 3045046.62),
  ('AWI-007', 6208245.71),
  ('AWI-008', 3023311.91),
  ('AWI-009', 1087729.05),
  ('AWI-010', 3776962.61),
  ('AWI-011', 2905979.09),
  ('AWI-012', 1434430.65),
  ('AWI-013', 3192336.69),
  ('AWI-014', 3646202.83),
  ('AWI-015', 1338048.44),
  ('AWI-016', 4240145.33),
  ('AWI-017', 2652820.43),
  ('AWI-018', 1908033.35),
  ('AWI-019', 791951.29),
  ('AWI-020', 1534813.68),
  ('AWI-021', 1138816.41),
  ('AWI-022', 7865698.84),
  ('AWI-023', 3268491.03),
  ('AWI-024', 2967217.38),
  ('AWI-025', 2159532.34),
  ('AWI-026', 1362454.55),
  ('AWI-027', 1211629.22),
  ('AWI-028', 273220.29),
  ('AWI-029', 1192926.13),
  ('AWI-030', 915726.01),
  ('AWI-031', 207316.70),
  ('AWI-032', 2199674.73),
  ('AWI-033', 574123.93),
  ('AWI-034', 2710878.68),
  ('AWI-035', 2827631.22),
  ('AWI-036', 2050068.09),
  ('AWI-037', 47940.16),
  ('AWI-038', 30214.10),
  ('AWI-039', 134029.86),
  ('AWI-040', 34494.44),
  ('AWI-041', 38107.04),
  ('AWI-042', 2162991.70),
  ('AWI-043', 2575289.65),
  ('AWI-044', 583675.72),
  ('AWI-045', 624854.56),
  ('AWI-046', 230481.64),
  ('AWI-047', 122923.54),
  ('AWI-048', 122923.54)
) as v(member_no, total)
 where m.member_no = v.member_no;

-- 3b) NON-MEMBER FUND ACCOUNTS -----------------------------------------------
-- Membership fees and Welfare belong in the fund TOTAL but are NOT members:
-- status='account' keeps them in fund totals while the app excludes them from
-- member counts, the fund-data dropdowns and the exit logic. opening + interest
-- are set so the reports distribution reconciles (opening + interest = TOTAL).
insert into public.member_finances
  (member_no, full_name, status, opening_balance_2025, contributions_2026,
   britam_interest_2026, jubilee_interest_2026, total_interest_2026,
   current_balance, refund_on_exit, net_balance, annual_goal, source)
values
  ('ACC-FEES', 'Membership fees', 'account', 913262.39, 0, 0, 0, 701165.17,
   1614427.56, 0, 1614427.56, 0, 'AWI Final Compiled Statement 2018-Jul 2026'),
  ('ACC-WELFARE', 'Welfare', 'account', 1000000.00, 0, 0, 0, 35489.57,
   1035489.57, 0, 1035489.57, 0, 'AWI Final Compiled Statement 2018-Jul 2026')
on conflict (member_no) do update set
  full_name             = excluded.full_name,
  status                = excluded.status,
  opening_balance_2025  = excluded.opening_balance_2025,
  contributions_2026    = excluded.contributions_2026,
  total_interest_2026   = excluded.total_interest_2026,
  current_balance       = excluded.current_balance,
  net_balance           = excluded.net_balance,
  source                = excluded.source,
  updated_at            = now();

-- 3c) NORMALISE AWI-007 WITHDRAWAL SIGN --------------------------------------
-- Standard convention: withdrawal stored POSITIVE, TOTAL = base - withdrawal.
-- AWI-007 (Lydia Kasera) was stored -1,455,000 with the amount folded into
-- opening. Re-express it so the fund-data recompute
--   opening_balance_2025 + contributions_2026 + total_interest_2026 - withdrawal
-- lands on her authoritative TOTAL 6,208,245.71 and the withdrawal shows on her
-- statement. Her TOTAL is unchanged.
update public.member_finances set
  withdrawal           = 1455000,
  opening_balance_2025 = 5088750.90,
  contributions_2026   = 150000,
  total_interest_2026  = 2424494.81,
  current_balance      = 6208245.71,
  net_balance          = 6208245.71,
  updated_at           = now()
where member_no = 'AWI-007';

-- END
