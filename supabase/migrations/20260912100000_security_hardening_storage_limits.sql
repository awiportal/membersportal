-- ============================================================================
-- AWIVEST -- server-side upload hardening (defense in depth)
--
-- The client validates file size and type (KycClient, WithdrawalsClient,
-- ProfileClient, OnboardingClient), but a direct storage API call can bypass
-- those checks. This migration enforces the same limits at the storage layer,
-- and pins member-upload buckets to raster image / PDF types only -- notably
-- EXCLUDING image/svg+xml, which can carry script and is a stored-XSS vector
-- when opened inline. It also guarantees the withdrawals bucket is private and
-- folder-scoped so member letters are reachable only via short-lived signed
-- URLs, never a public URL.
--
-- Safe + idempotent: UPDATEs that match no bucket id are no-ops; policies are
-- dropped by name before being recreated. Apply manually (the assistant cannot
-- run DDL): Supabase SQL editor or `supabase db push`.
-- ============================================================================

-- ---- Per-bucket size + MIME allow-lists ------------------------------------

-- KYC identity documents: photos or a PDF scan, up to 25 MiB. No SVG.
update storage.buckets
  set file_size_limit = 26214400,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif','application/pdf']
  where id = 'kyc';

-- Member-uploaded withdrawal letters: photo or PDF, up to 25 MiB. No SVG.
update storage.buckets
  set public = false,
      file_size_limit = 26214400,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
  where id = 'withdrawals';

-- Avatars: images up to 15 MiB (the app re-encodes to JPEG on the client). No SVG.
update storage.buckets
  set file_size_limit = 15728640,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
  where id = 'avatars';

-- Generated signature images: small PNG/JPEG only.
update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/png','image/jpeg']
  where id = 'signatures';

-- Staff-managed buckets carry varied document types; cap size only so we never
-- reject a legitimate staff upload by MIME.
update storage.buckets set file_size_limit = 52428800 where id in ('documents','agreements','claims');

-- ---- Withdrawals bucket: private + folder-scoped access --------------------
-- Matches the object path the app writes: "<auth.uid()>/letter-<ts>.<ext>".
-- Owner may read/write their own folder; staff may read all for the queue.

drop policy if exists "withdrawals own or staff: read" on storage.objects;
create policy "withdrawals own or staff: read" on storage.objects for select
  using ( bucket_id = 'withdrawals'
          and ( (storage.foldername(name))[1] = auth.uid()::text or public.is_staff() ) );

drop policy if exists "withdrawals own: insert" on storage.objects;
create policy "withdrawals own: insert" on storage.objects for insert
  with check ( bucket_id = 'withdrawals'
               and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "withdrawals own or staff: update" on storage.objects;
create policy "withdrawals own or staff: update" on storage.objects for update
  using ( bucket_id = 'withdrawals'
          and ( (storage.foldername(name))[1] = auth.uid()::text or public.is_staff() ) )
  with check ( bucket_id = 'withdrawals'
               and (storage.foldername(name))[1] = auth.uid()::text );
