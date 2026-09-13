-- Documents to Sign e-signing module.
-- Two tables: sign_requests (one admin upload/send) and sign_request_recipients
-- (one row per member the document was sent to, carrying the member signature
-- and the Admin/Chairlady countersignature). All WRITES go through server
-- actions using the service-role admin client; the RLS policies below only grant
-- each member read access to their OWN rows.

create table if not exists public.sign_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  doc_type text not null default 'other',
  note text,
  file_path text not null,
  file_name text,
  mime_type text,
  audience text not null default 'individual',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.sign_request_recipients (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sign_requests(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'sent',            -- sent | signed | completed
  member_signed_name text,
  member_signed_at timestamptz,
  member_signature_image text,
  member_signature_kind text,
  countersigned_by uuid references public.profiles(id),
  countersigned_name text,
  countersigned_at timestamptz,
  countersign_signature_image text,
  countersign_signature_kind text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, member_id)
);
alter table public.sign_requests enable row level security;
alter table public.sign_request_recipients enable row level security;
create policy sign_req_read_own on public.sign_requests for select using (
  exists (select 1 from public.sign_request_recipients r where r.request_id = sign_requests.id and r.member_id = auth.uid())
);
create policy sign_rcpt_read_own on public.sign_request_recipients for select using (member_id = auth.uid());
