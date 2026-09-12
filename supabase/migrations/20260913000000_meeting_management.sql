-- ============================================================================
-- AWIVEST — Meeting Management (#159)
--   Committee / general meetings with agenda, minutes, attendance and action
--   items. Three tables + RLS. Staff manage everything; members have no access
--   in this first version (governance-internal). Staff mutations reuse the
--   existing audit_staff_insert policy to record an audit_log trail.
-- ============================================================================

-- 1) Meetings -----------------------------------------------------------------
create table if not exists public.meetings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organizations(id),
  title         text not null,
  meeting_type  text not null default 'committee'
                  check (meeting_type in ('agm','committee','general','special','other')),
  scheduled_at  timestamptz,
  location      text,
  status        text not null default 'scheduled'
                  check (status in ('scheduled','held','cancelled')),
  agenda        text not null default '',
  minutes       text not null default '',
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.meetings enable row level security;

drop trigger if exists t_meetings_updated_at on public.meetings;
create trigger t_meetings_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

-- 2) Attendance ---------------------------------------------------------------
create table if not exists public.meeting_attendance (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references public.meetings(id) on delete cascade,
  member_id    uuid references public.profiles(id) on delete set null,
  name         text,                        -- snapshot / non-member guest name
  status       text not null default 'present'
                 check (status in ('present','absent','apology')),
  created_at   timestamptz not null default now()
);

-- One attendance row per member per meeting (guests keep member_id null).
create unique index if not exists uq_meeting_attendance_member
  on public.meeting_attendance (meeting_id, member_id)
  where member_id is not null;

alter table public.meeting_attendance enable row level security;

-- 3) Action items -------------------------------------------------------------
create table if not exists public.meeting_action_items (
  id             uuid primary key default gen_random_uuid(),
  meeting_id     uuid not null references public.meetings(id) on delete cascade,
  description    text not null,
  assignee_id    uuid references public.profiles(id) on delete set null,
  assignee_name  text,                      -- snapshot / free-text owner
  due_date       date,
  status         text not null default 'open'
                   check (status in ('open','done','cancelled')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.meeting_action_items enable row level security;

drop trigger if exists t_meeting_action_items_updated_at on public.meeting_action_items;
create trigger t_meeting_action_items_updated_at
  before update on public.meeting_action_items
  for each row execute function public.set_updated_at();

-- RLS: staff manage everything; members have no access in this version --------
drop policy if exists meetings_staff on public.meetings;
create policy meetings_staff on public.meetings
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists meeting_attendance_staff on public.meeting_attendance;
create policy meeting_attendance_staff on public.meeting_attendance
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists meeting_action_items_staff on public.meeting_action_items;
create policy meeting_action_items_staff on public.meeting_action_items
  for all using (public.is_staff()) with check (public.is_staff());

-- Helpful indexes
create index if not exists idx_meetings_when on public.meetings (scheduled_at desc);
create index if not exists idx_meeting_attendance_meeting on public.meeting_attendance (meeting_id);
create index if not exists idx_meeting_action_items_meeting on public.meeting_action_items (meeting_id);

-- audit_staff_insert already exists (added in the Information Center migration);
-- meeting mutations reuse it to write an audit trail. No change needed here.

-- END Meeting Management
