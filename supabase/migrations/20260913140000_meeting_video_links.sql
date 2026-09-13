alter table public.meetings
  add column if not exists meeting_link text,
  add column if not exists meeting_provider text not null default 'none',
  add column if not exists meeting_passcode text,
  add column if not exists member_visible boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'meetings_meeting_provider_chk') then
    alter table public.meetings add constraint meetings_meeting_provider_chk
      check (meeting_provider in ('none','meet','zoom','other'));
  end if;
end $$;

drop policy if exists meetings_member_visible on public.meetings;
create policy meetings_member_visible on public.meetings
  for select using (member_visible = true and auth.uid() is not null);

create index if not exists idx_meetings_member_visible on public.meetings (member_visible, scheduled_at desc);
