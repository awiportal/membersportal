-- v1.19: capture each member's original AWI join date, surfaced as "Member since".
-- Idempotent: the column already exists in some environments (live DB), so guard with IF NOT EXISTS.
alter table public.profiles add column if not exists date_joined date;
comment on column public.profiles.date_joined is 'Date the member originally joined AWIVEST. Shown as "Member since"; falls back to joined_at/created_at when null.';
