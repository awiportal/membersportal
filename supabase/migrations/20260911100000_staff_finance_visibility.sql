-- ============================================================================
-- AWIVEST — staff finance visibility + welfare management
-- Aligns the member-financial tables with the is_staff() pattern already used by
-- member_finances and notifications, so SECRETARIES (not just admins) can see
-- member finances and manage welfare claims. Idempotent: drops + recreates the
-- affected policies.
-- ============================================================================

-- Welfare: staff (secretary/admin/chairlady) read + manage; members their own.
drop policy if exists welf_c_owner on public.welfare_claims;
create policy welf_c_owner on public.welfare_claims
  for all using (member_id = auth.uid() or public.is_staff())
  with check (member_id = auth.uid() or public.is_staff());

drop policy if exists welf_e_owner on public.welfare_enrollments;
create policy welf_e_owner on public.welfare_enrollments
  for all using (member_id = auth.uid() or public.is_staff())
  with check (member_id = auth.uid() or public.is_staff());

-- Contributions & dividends: staff can READ every member's history. Writes stay
-- admin / service-role only — the existing contrib_admin and div_admin policies
-- are left unchanged.
drop policy if exists contrib_read on public.contributions;
create policy contrib_read on public.contributions
  for select using (member_id = auth.uid() or public.is_staff());

drop policy if exists div_read on public.dividends;
create policy div_read on public.dividends
  for select using (member_id = auth.uid() or public.is_staff());
