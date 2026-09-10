-- ============================================================================
-- AWIVEST — Information Center
--   A single shared feed the office publishes to every member: Announcements,
--   News, Events and Updates. One table + RLS (members read published items,
--   staff manage everything). Also lets staff mutations write an audit trail.
-- ============================================================================

create table if not exists public.announcements (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references public.organizations(id),
  category       text not null default 'announcement'
                   check (category in ('announcement','news','event','update')),
  title          text not null,
  body           text not null default '',
  link_url       text,
  event_at       timestamptz,          -- events: when it happens
  event_location text,                 -- events: where it happens
  pinned         boolean not null default false,
  published      boolean not null default false,
  published_at   timestamptz,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.announcements enable row level security;

-- Keep updated_at fresh on every edit (shared trigger fn from earlier migrations).
drop trigger if exists t_announcements_updated_at on public.announcements;
create trigger t_announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

-- Members see published items; staff see all and manage.
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select using (published = true or public.is_staff());

drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements
  for all using (public.is_staff()) with check (public.is_staff());

-- Feed ordering: published items, newest first.
create index if not exists idx_announcements_feed
  on public.announcements (published, published_at desc);

-- Let staff mutations record an audit_log trail (publish/unpublish/delete).
-- audit_log already exists with a staff/admin SELECT policy; add INSERT for staff.
drop policy if exists audit_staff_insert on public.audit_log;
create policy audit_staff_insert on public.audit_log
  for insert with check (public.is_staff());

-- END Information Center
