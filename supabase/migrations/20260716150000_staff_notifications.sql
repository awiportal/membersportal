-- ============================================================================
-- AWIVEST — migration v0.3c: let staff create notifications for members
-- So a Secretary (not just Admin) can send approval / returned-pack notices.
-- ============================================================================

drop policy if exists notif_owner on public.notifications;
create policy notif_owner on public.notifications
  for all using (member_id = auth.uid() or public.is_staff())
  with check (member_id = auth.uid() or public.is_staff());
