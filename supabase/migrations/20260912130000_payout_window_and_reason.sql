-- ============================================================================
-- AWIVEST — payout requests: reason type + admin-controlled payout window
--
-- 1) reason_type on withdrawal_requests: every payout request now records WHY —
--    'exit' (member leaving the fund) or 'other' (a normal partial payout).
-- 2) disbursed_reference on withdrawal_requests: the real M-Pesa/bank transaction
--    reference captured by the Admin at the moment funds are sent.
-- 3) app_settings('withdrawals_open'): a single admin toggle. AWIVEST is a
--    long-term fund, so the payout window is CLOSED by default; an Admin opens it
--    to invite "other" (non-exit) payout requests, and can switch it off again.
--    Exit requests are ALWAYS accepted (a member may always leave), enforced in
--    the server action, independent of this flag.
-- ============================================================================

alter table public.withdrawal_requests
  add column if not exists reason_type          text,
  add column if not exists disbursed_reference  text;

-- Backfill historic requests so every row has a reason type.
update public.withdrawal_requests
   set reason_type = 'other'
 where reason_type is null;

-- Payout window (Admin-controlled). Default closed. Readable by any authenticated
-- user (app_settings_read policy); writable by staff only (app_settings_write).
insert into public.app_settings (key, value) values ('withdrawals_open', 'false')
on conflict (key) do nothing;

-- END
