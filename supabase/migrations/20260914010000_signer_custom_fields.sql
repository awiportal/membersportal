-- Custom signer fields for the sequential (ordered) Documents-to-Sign flow.
-- ADDITIVE + idempotent: each ordered signing step may carry zero or more
-- per-signer custom fields. The admin builder authors the field DEFINITIONS
-- (with value = null) when creating the chain; each signer fills in the VALUES
-- when they sign. A step whose custom_fields is [] behaves exactly as before,
-- so the existing individual and sequential flows are untouched.
--
-- Each element of the jsonb array has this shape:
--   {
--     "key":      text,              -- stable slug (label slug + index), unique within the step
--     "label":    text,              -- human label shown to the signer and on the certificate
--     "type":     "text" | "date",   -- input type rendered in the signing UI
--     "required": boolean,           -- when true, signing is blocked until a non-empty value is given
--     "value":    text | null        -- null on the admin-authored definition; the signer's answer once signed
--   }

alter table public.sign_request_steps
  add column if not exists custom_fields jsonb not null default '[]'::jsonb;

comment on column public.sign_request_steps.custom_fields is
  'Ordered array of per-step custom signer fields. Each element: { "key": text, "label": text, "type": "text"|"date", "required": boolean, "value": text|null }. The admin authors definitions with value=null; the signer sets value when signing. Empty array (the default) means no custom fields and preserves the original behaviour.';
