-- ============================================================================
-- #94 - Complete the signed-URL hardening: make the 'agreements' bucket private.
-- Member reads now go through service-role signed URLs / downloads; staff read
-- via their SSR client. Nothing relies on public bucket URLs anymore.
-- Apply AFTER the code that mints signed URLs is deployed.
-- ============================================================================

-- The bucket previously had staff insert/update/delete storage policies but NO
-- select policy, relying on implicit public read. Add a staff SELECT policy so
-- staff createSignedUrl keeps working once the bucket is private. Members read
-- via the service-role client, which bypasses RLS.
drop policy if exists "agreements: staff read" on storage.objects;
create policy "agreements: staff read" on storage.objects
  for select using (bucket_id = 'agreements' and public.is_staff());

-- Make the bucket private.
update storage.buckets set public = false where id = 'agreements';
