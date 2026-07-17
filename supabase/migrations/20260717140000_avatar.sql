-- ============================================================================
-- AWIVEST Investor Portal — migration v1.1: member profile photos
-- Adds profiles.avatar_url and a public "avatars" storage bucket. Members can
-- upload a photo of themselves; if they don't, the portal keeps showing their
-- coloured initials. Idempotent: safe to run more than once.
-- ============================================================================

alter table public.profiles
  add column if not exists avatar_url text;

-- Public bucket so photos display everywhere without signed URLs.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- A member may only write files inside a folder named after their own user id
-- (e.g. "<user-id>/avatar.jpg"). Reads are public because the bucket is public.
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- END v1.1
