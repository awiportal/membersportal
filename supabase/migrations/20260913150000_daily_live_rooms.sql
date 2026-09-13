-- Phase 3: Daily.co in-portal live rooms + cloud recordings.
-- Additive + idempotent. Builds on the Phase 2 meetings video columns.

-- allow provider 'daily'
alter table public.meetings drop constraint if exists meetings_meeting_provider_chk;
alter table public.meetings add constraint meetings_meeting_provider_chk
  check (meeting_provider in ('none','meet','zoom','other','daily'));
alter table public.meetings add column if not exists daily_room_name text;

create table if not exists public.meeting_recordings (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  provider text not null default 'daily',
  recording_ref text,
  room_name text,
  status text not null default 'ready',
  duration_seconds int,
  started_at timestamptz,
  created_at timestamptz not null default now(),
  unique (meeting_id, recording_ref)
);
create index if not exists idx_meeting_recordings_meeting on public.meeting_recordings(meeting_id, created_at desc);
alter table public.meeting_recordings enable row level security;
drop policy if exists meeting_recordings_staff on public.meeting_recordings;
create policy meeting_recordings_staff on public.meeting_recordings for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists meeting_recordings_member_visible on public.meeting_recordings;
create policy meeting_recordings_member_visible on public.meeting_recordings for select using (
  exists (select 1 from public.meetings m where m.id = meeting_recordings.meeting_id and m.member_visible = true) and auth.uid() is not null
);
