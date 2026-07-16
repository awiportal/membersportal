-- ============================================================================
-- AWIVEST — migration v0.6: app settings + e-sign tracking (PandaDoc)
--   * app_settings   : key/value config editable by staff (template IDs, role).
--                      Readable by any authenticated user (template IDs aren't
--                      secret; the PandaDoc API key stays a server env var).
--   * profiles.esign_* : tracks the member's onboarding-packet e-signature.
-- ============================================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.app_settings enable row level security;

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select using (auth.uid() is not null);

drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for all using (public.is_staff()) with check (public.is_staff());

insert into public.app_settings (key, value) values
  ('pandadoc_signer_role', 'Investor')
on conflict (key) do nothing;

-- Onboarding-packet e-signature state on the member profile.
alter table public.profiles add column if not exists esign_document_id text;
alter table public.profiles add column if not exists esign_status text not null default 'not_started';
alter table public.profiles add column if not exists esign_signed_at timestamptz;

-- END v0.6
