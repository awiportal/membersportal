-- Broadcast/fan-out grouping for the sequential signing flow.
-- When a document is sent to "All active members" (or "Selected members"), one
-- sequential chain is created per member; batch_id groups those chains so the
-- staff view can roll up progress ("M of N members completed").
--
-- This lives in its OWN migration (not appended to 20260913130000) because that
-- earlier migration was already applied in production and will not re-run.
-- Additive + idempotent.
alter table public.sign_requests add column if not exists batch_id uuid;
create index if not exists idx_sign_requests_batch on public.sign_requests(batch_id);
