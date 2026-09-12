-- Capture an optional drawn/uploaded signature image on agreement acceptances.
-- The member portal Agreements page lets a member sign an additional agreement
-- by typing their full name and either drawing a signature or uploading an
-- image of one. These columns store that signature. Both are optional, so the
-- prior name-only signing continues to work unchanged.

alter table public.agreement_acceptances
  add column if not exists signature_image text,
  add column if not exists signature_kind text;

comment on column public.agreement_acceptances.signature_image is
  'Optional data URL (PNG/JPEG) of the member''s drawn or uploaded signature.';
comment on column public.agreement_acceptances.signature_kind is
  'How the signature was captured: draw | upload (null when name-only).';
