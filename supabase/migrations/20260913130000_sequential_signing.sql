-- Sequential (ordered) signing flow for the Documents to Sign module.
-- Additive + idempotent: extends sign_requests and adds an ordered-steps table.
-- The existing individual (member-signs -> admin-countersigns) flow is untouched.

-- flow values: 'individual' | 'sequential'
alter table public.sign_requests
  add column if not exists flow text not null default 'individual';

alter table public.sign_requests
  add column if not exists completed_at timestamptz;

-- One ordered signing step per participant. status: 'pending' | 'active' | 'signed'.
create table if not exists public.sign_request_steps (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sign_requests(id) on delete cascade,
  step_order int not null,
  signer_id uuid not null references public.profiles(id) on delete cascade,
  signer_role text,
  status text not null default 'pending',
  signed_name text,
  signed_at timestamptz,
  signed_date date,
  signature_image text,
  signature_kind text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, step_order)
);

create index if not exists idx_sign_steps_request
  on public.sign_request_steps (request_id, step_order);
create index if not exists idx_sign_steps_signer
  on public.sign_request_steps (signer_id, status);

alter table public.sign_request_steps enable row level security;

-- A signer may read only their own step rows. All privileged writes go through
-- the service-role client in the server actions (which bypasses RLS), so no
-- INSERT/UPDATE policy is granted here.
drop policy if exists sign_steps_read_own on public.sign_request_steps;
create policy sign_steps_read_own on public.sign_request_steps
  for select using (signer_id = auth.uid());

-- A step signer may also read the parent request row (title, file metadata) so
-- the portal can render the document they are being asked to sign.
drop policy if exists sign_req_read_step_signer on public.sign_requests;
create policy sign_req_read_step_signer on public.sign_requests
  for select using (
    exists (
      select 1 from public.sign_request_steps s
      where s.request_id = sign_requests.id
        and s.signer_id = auth.uid()
    )
  );
