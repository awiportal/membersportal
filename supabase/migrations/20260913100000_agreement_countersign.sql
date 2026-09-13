-- Agreement acceptances become two-party. The member signs during onboarding
-- (or from the Agreements page); an Admin/Chairlady then countersigns as part of
-- approving the member. These columns mirror sign_request_recipients so both
-- signing flows share the same audit shape. Additive + idempotent.
alter table public.agreement_acceptances
  add column if not exists countersigned_by uuid references public.profiles(id),
  add column if not exists countersigned_name text,
  add column if not exists countersigned_at timestamptz,
  add column if not exists countersign_signature_image text,
  add column if not exists countersign_signature_kind text;

comment on column public.agreement_acceptances.countersigned_by is
  'Admin/Chairlady who countersigned the acceptance (usually at member approval).';
comment on column public.agreement_acceptances.countersigned_name is
  'Display name recorded for the countersigner at countersign time.';
comment on column public.agreement_acceptances.countersigned_at is
  'Timestamp the acceptance was countersigned (approval time).';
comment on column public.agreement_acceptances.countersign_signature_image is
  'Data URL of the countersigner drawn/uploaded signature (optional).';
comment on column public.agreement_acceptances.countersign_signature_kind is
  'draw | upload — how the countersignature image was captured.';
