-- ============================================================================
-- AWIVEST Investor Portal — In-app notifications: real-time delivery + reach
--
-- Two gaps fixed here:
--   1) The notifications table was never surfaced live. Enable Supabase Realtime
--      so a new row pushes straight to the member's notification bell, and add
--      click-through (link_url) + read tracking (read_at) + fast indexes.
--   2) Publishing an Information Center post (announcement/news/event/update)
--      wrote nothing to notifications, so members were never told. Add
--      announcement_id so the app can fan a PUBLISHED post out to members who
--      opted in to "AWIVEST news & events" (profiles.notification_prefs.marketing),
--      deduped one-per-announcement — see
--      web/app/(staff)/staff/information/actions.ts.
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table public.notifications
  add column if not exists link_url        text,
  add column if not exists read_at         timestamptz,
  add column if not exists announcement_id uuid references public.announcements(id) on delete cascade;

-- Feed + unread lookups per member.
create index if not exists notifications_member_created_idx
  on public.notifications (member_id, created_at desc);

create index if not exists notifications_member_unread_idx
  on public.notifications (member_id) where read = false;

-- One notification per member per announcement. NULL announcement_id rows
-- (approvals, welfare, etc.) are unaffected — NULLs are distinct in a unique
-- index — so only announcement fan-out is deduped, which is what we want.
create unique index if not exists notifications_member_announcement_uidx
  on public.notifications (member_id, announcement_id);

-- Realtime: publish row changes so the browser's postgres_changes subscription
-- (RLS-filtered to the signed-in member via the existing notif_owner policy)
-- receives INSERT/UPDATE live.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- END
