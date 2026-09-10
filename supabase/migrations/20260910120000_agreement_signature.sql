-- v1.21: native drawn-signature acceptance. Members sign membership
-- agreements in-app with their name, the date, and a drawn signature; the
-- acceptance is stamped like an e-sign certificate. Extends the existing
-- typed-name agreement_acceptances table. Idempotent.
alter table public.agreement_acceptances
  add column if not exists signature_image text,
  add column if not exists signed_date date;
comment on column public.agreement_acceptances.signature_image is 'Data URL (image/png) of the member drawn signature captured in-app.';
comment on column public.agreement_acceptances.signed_date is 'Signature date shown on the stamp; falls back to signed_at when null.';
