-- ============================================================================
-- AWIVEST — member withdrawals ledger + staff record-withdrawal RPC
--
-- Replaces the hand-typed "absorbed into opening" statement note with a real
-- record. Recording a withdrawal reduces the member's net_balance AND
-- current_balance (portfolio value) and drives the "Withdrawals" line on the
-- statement, which reads member_finances.withdrawal (kept as the POSITIVE ledger
-- total; StatementSheet renders it as "- KES <total>" when > 0).
-- ============================================================================

create table if not exists public.withdrawals (
  id           uuid primary key default gen_random_uuid(),
  member_no    text not null references public.member_finances(member_no) on update cascade,
  member_id    uuid references public.profiles(id) on delete set null,  -- copied from the fund record at time of recording
  amount       numeric(16,2) not null check (amount > 0),               -- always positive
  method       text,                                                    -- mpesa | bank | cheque | cash | other
  reference    text,                                                    -- M-Pesa / bank reference
  note         text,
  recorded_by  uuid references public.profiles(id),
  occurred_at  date not null default current_date,
  created_at   timestamptz not null default now()
);

alter table public.withdrawals enable row level security;

-- Staff (secretary/admin/chairlady) manage every row; a member reads only her own.
drop policy if exists withdrawals_staff on public.withdrawals;
create policy withdrawals_staff on public.withdrawals
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists withdrawals_owner_read on public.withdrawals;
create policy withdrawals_owner_read on public.withdrawals
  for select using (member_id = auth.uid());

create index if not exists withdrawals_member_no_idx on public.withdrawals (member_no);
create index if not exists withdrawals_member_id_idx on public.withdrawals (member_id);

-- Atomic: insert a withdrawal, refresh the member_finances aggregate + balances,
-- and write an audit row. SECURITY DEFINER (so it can update member_finances and
-- audit_log) but gated on is_staff() so only staff can call it.
--
-- member_finances.withdrawal is recomputed as the POSITIVE ledger sum, which
-- self-heals any legacy sign (e.g. an old -1,455,000) the first time a real
-- withdrawal is recorded for that member.
create or replace function public.staff_record_withdrawal(
  p_member_no text,
  p_amount    numeric,
  p_method    text default null,
  p_reference text default null,
  p_note      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  v_member_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Withdrawal amount must be positive';
  end if;

  select member_id into v_member_id from public.member_finances where member_no = p_member_no;
  if not found then
    raise exception 'No fund record for %', p_member_no;
  end if;

  insert into public.withdrawals (member_no, member_id, amount, method, reference, note, recorded_by)
    values (p_member_no, v_member_id, p_amount, p_method, p_reference, p_note, v_actor);

  update public.member_finances mf
     set withdrawal      = (select coalesce(sum(w.amount), 0) from public.withdrawals w where w.member_no = p_member_no),
         net_balance     = mf.net_balance - p_amount,
         current_balance = mf.current_balance - p_amount,
         updated_at      = now()
   where mf.member_no = p_member_no;

  insert into public.audit_log (actor_id, member_id, action, meta)
    values (v_actor, v_member_id, 'withdrawal_recorded',
            jsonb_build_object('member_no', p_member_no, 'amount', p_amount, 'method', p_method, 'reference', p_reference));
end;
$$;

grant execute on function public.staff_record_withdrawal(text, numeric, text, text, text) to authenticated;
