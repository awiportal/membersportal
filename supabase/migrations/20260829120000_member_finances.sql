-- ============================================================================
-- AWIVEST Investor Portal — migration v1.2: member finances (fund positions)
--
-- Imports the 48-member fund positions from the cleaned AWIVEST contributions &
-- earnings workbook (v3, prepared 14 Aug 2026 by Moses Njeru Munyi):
--   * Opening balance at 31 Dec 2025
--   * 2026 contributions (YTD)
--   * Britam / Jubilee interest 2026 (0 until insurer statements are posted)
--   * Current balance, refund-on-exit, net balance in fund, annual goal
--
-- Rows are keyed by the AWIVEST register number (AWI-001 .. AWI-048), NOT by a
-- portal login, so the data can be loaded now — before members have accounts.
-- When a member registers, staff link her login by setting member_id, and her
-- dashboard then shows her own figures (see the member-read RLS policy below).
--
-- Idempotent: re-running refreshes the figures via ON CONFLICT (member_no).
-- ============================================================================

create table if not exists public.member_finances (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organizations(id) default 'a0000000-0000-4000-8000-000000000001',
  member_no     text not null unique,                              -- AWIVEST register no., e.g. AWI-001
  member_id     uuid references public.profiles(id) on delete set null, -- linked to a portal login when available
  full_name     text not null,
  status        text not null default 'active',                    -- active | exiting | exited
  refund_status text,                                              -- e.g. 'in_process' while a member is exiting
  opening_balance_2025  numeric(16,2) not null default 0,          -- opening balance at 31 Dec 2025
  contributions_2026    numeric(16,2) not null default 0,          -- YTD contributions in 2026
  britam_interest_2026  numeric(16,2) not null default 0,
  jubilee_interest_2026 numeric(16,2) not null default 0,
  total_interest_2026   numeric(16,2) not null default 0,
  current_balance       numeric(16,2) not null default 0,
  refund_on_exit        numeric(16,2) not null default 0,
  net_balance           numeric(16,2) not null default 0,
  annual_goal           numeric(16,2) not null default 0,
  as_of        date not null default date '2026-07-31',
  source       text default 'AWI Cleaned Contributions & Earnings 2026 (v3, 14 Aug 2026)',
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.member_finances enable row level security;

-- Staff (secretary/admin/chairlady) manage every row.
drop policy if exists member_finances_staff on public.member_finances;
create policy member_finances_staff on public.member_finances
  for all using (public.is_staff()) with check (public.is_staff());

-- A member may read ONLY her own linked row (member_id set to her login).
drop policy if exists member_finances_owner_read on public.member_finances;
create policy member_finances_owner_read on public.member_finances
  for select using (member_id = auth.uid());

drop trigger if exists t_member_finances_updated_at on public.member_finances;
create trigger t_member_finances_updated_at
  before update on public.member_finances
  for each row execute function public.set_updated_at();

create index if not exists member_finances_member_id_idx on public.member_finances (member_id);

-- ---------------------------------------------------------------------------
-- SEED: 48 members (AWI-001 .. AWI-048). Amounts in KES.
--   Fund totals: opening 106,396,145 + 2026 contributions 7,027,118
--                = current balance 113,423,263 (interest not yet posted).
-- ---------------------------------------------------------------------------
insert into public.member_finances
  (member_no, full_name, opening_balance_2025, contributions_2026, britam_interest_2026, jubilee_interest_2026, total_interest_2026, current_balance, refund_on_exit, net_balance, annual_goal)
values
  ('AWI-001','Agnes A Odinga',8240046,1038416,0,0,0,9278462,0,9278462,300000),
  ('AWI-002','Maureen Onyango',3326012,100000,0,0,0,3426012,0,3426012,300000),
  ('AWI-003','Rachel Anyango Mirindo',8466458,0,0,0,0,8466458,0,8466458,300000),
  ('AWI-004','Lydia Ogutu',4413227,589382,0,0,0,5002609,0,5002609,300000),
  ('AWI-005','Everlyn Akelo Oketch',7812818,1300000,0,0,0,9112818,0,9112818,300000),
  ('AWI-006','Lucy Ayodo',2851147,50000,0,0,0,2901147,0,2901147,300000),
  ('AWI-007','Lydia Kasera',7217265,150000,0,0,0,7367265,0,7367265,300000),
  ('AWI-008','Mary Ndira',2584245,300000,0,0,0,2884245,0,2884245,300000),
  ('AWI-009','Linet Ogola',1043521,0,0,0,0,1043521,0,1043521,300000),
  ('AWI-010','Pamela Otieno',3505936,100000,0,0,0,3605936,0,3605936,300000),
  ('AWI-011','Josephine Atieno Omondi',2764274,6000,0,0,0,2770274,0,2770274,300000),
  ('AWI-012','Nancy Youree',1375821,0,0,0,0,1375821,0,1375821,300000),
  ('AWI-013','Hon. Eve Obara',3040327,0,0,0,0,3040327,0,3040327,300000),
  ('AWI-014','Pamela Ogutu',3178808,300000,0,0,0,3478808,0,3478808,300000),
  ('AWI-015','Eunice Seline Ooko',1272713,0,0,0,0,1272713,0,1272713,300000),
  ('AWI-016','Joyce Okayo',3926972,100000,0,0,0,4026972,0,4026972,300000),
  ('AWI-017','Christine Mkaya',2525814,0,0,0,0,2525814,0,2525814,300000),
  ('AWI-018','Elsie Otieno',1810754,0,0,0,0,1810754,0,1810754,300000),
  ('AWI-019','Prisca Mbilika',759613,0,0,0,0,759613,0,759613,300000),
  ('AWI-020','Nana Ireri',1461670,0,0,0,0,1461670,0,1461670,300000),
  ('AWI-021','Judy Kiaye Magambo',1092067,0,0,0,0,1092067,0,1092067,300000),
  ('AWI-022','Nelly Opiyo',7451883,0,0,0,0,7451883,0,7451883,300000),
  ('AWI-023','Millicent Odiembo',2937081,180000,0,0,0,3117081,0,3117081,300000),
  ('AWI-024','Eunice Lamba',2827611,0,0,0,0,2827611,0,2827611,300000),
  ('AWI-025','Mylene Shiroko',2071273,0,0,0,0,2071273,0,2071273,300000),
  ('AWI-026','Mary Achieng Okech',1299399,0,0,0,0,1299399,0,1299399,300000),
  ('AWI-027','Immaculate A Okeyo',1162130,0,0,0,0,1162130,0,1162130,300000),
  ('AWI-028','Eddah Akumu',262094,0,0,0,0,262094,0,262094,300000),
  ('AWI-029','Trixie Ogot Kinyua',1144192,0,0,0,0,1144192,0,1144192,300000),
  ('AWI-030','Esther Ogara',876561,0,0,0,0,876561,0,876561,300000),
  ('AWI-031','Dinah Ogara',198885,0,0,0,0,198885,0,198885,300000),
  ('AWI-032','Susan Mulaah',1894841,200000,0,0,0,2094841,0,2094841,300000),
  ('AWI-033','Musonda Kholiwe Tembo',550693,0,0,0,0,550693,0,550693,300000),
  ('AWI-034','Josephine Ouma',2260373,300000,0,0,0,2560373,0,2560373,300000),
  ('AWI-035','Ruby Akinyi Oluoch',2707393,0,0,0,0,2707393,0,2707393,300000),
  ('AWI-036','Margret Wameyo',1851689,100000,0,0,0,1951689,0,1951689,300000),
  ('AWI-037','Marie Kopiyo',46025,0,0,0,0,46025,0,46025,300000),
  ('AWI-038','Susan Oketch Shanks',29024,0,0,0,0,29024,0,29024,300000),
  ('AWI-039','Agnes'' (secondary)',128595,0,0,0,0,128595,0,128595,300000),
  ('AWI-040','Jamila Nasra',18041,15000,0,0,0,33041,0,33041,300000),
  ('AWI-041','Fatuma Nasujo',35930,0,0,0,0,35930,0,35930,300000),
  ('AWI-042','Elizabeth A Okumu',2046689,5000,0,0,0,2051689,0,2051689,300000),
  ('AWI-043','Flora Kamala',511680,1988320,0,0,0,2500000,0,2500000,300000),
  ('AWI-044','Yvonne Omedi',474215,80000,0,0,0,554215,0,554215,300000),
  ('AWI-045','Julie Otieno',600340,0,0,0,0,600340,0,600340,300000),
  ('AWI-046','Maureen Okech',100000,125000,0,0,0,225000,0,225000,300000),
  ('AWI-047','Lillian Ogutu',120000,0,0,0,0,120000,0,120000,300000),
  ('AWI-048','Millicent Ogutu',120000,0,0,0,0,120000,0,120000,300000)
on conflict (member_no) do update set
  full_name             = excluded.full_name,
  opening_balance_2025  = excluded.opening_balance_2025,
  contributions_2026    = excluded.contributions_2026,
  britam_interest_2026  = excluded.britam_interest_2026,
  jubilee_interest_2026 = excluded.jubilee_interest_2026,
  total_interest_2026   = excluded.total_interest_2026,
  current_balance       = excluded.current_balance,
  refund_on_exit        = excluded.refund_on_exit,
  net_balance           = excluded.net_balance,
  annual_goal           = excluded.annual_goal,
  updated_at            = now();

-- ---------------------------------------------------------------------------
-- EXITING MEMBERS (refund in process): two members are winding down and their
-- refunds are being processed. Confirm the two AWI numbers, then flag them:
--
--   update public.member_finances
--     set status = 'exiting', refund_status = 'in_process'
--     where member_no in ('AWI-0XX','AWI-0YY');
--
-- Left unset here so no member's money is mislabelled before confirmation.
-- ---------------------------------------------------------------------------

-- END v1.2
