-- Auth rate limiting: a small fixed-window counter used by the login and 2FA
-- server-side flows to blunt credential stuffing and OTP brute force / flooding.
-- It is defense-in-depth on top of Supabase's own auth rate limits, and the app
-- layer treats it as fail-open, so a problem here never blocks a real member.

create table if not exists public.auth_rate_limits (
  bucket text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

alter table public.auth_rate_limits enable row level security;
-- No policies on purpose: this table is only ever touched through the SECURITY
-- DEFINER function below, never directly by clients. RLS enabled with zero
-- policies means anon/authenticated cannot select or write it directly.

-- Atomic "hit" for a bucket. Increments the counter within a fixed window,
-- resetting the window once it has expired. Returns TRUE when the caller is
-- still within the limit (allowed), FALSE when the limit is exceeded (blocked).
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_max integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
begin
  insert into public.auth_rate_limits as r (bucket, window_start, count)
  values (p_bucket, v_now, 1)
  on conflict (bucket) do update
    set window_start = case
          when r.window_start < v_now - make_interval(secs => p_window_seconds)
          then v_now else r.window_start end,
        count = case
          when r.window_start < v_now - make_interval(secs => p_window_seconds)
          then 1 else r.count + 1 end
  returning count into v_count;

  -- Opportunistic self-cleanup so the table cannot grow without bound from
  -- one-off buckets (e.g. many distinct IPs). Runs on ~0.5% of calls.
  if random() < 0.005 then
    delete from public.auth_rate_limits
    where window_start < v_now - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public;
grant execute on function public.rate_limit_hit(text, integer, integer) to anon, authenticated;
