'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/roles';

const VALID_ROLES = new Set(['member', 'secretary', 'treasurer', 'auditor', 'admin', 'superadmin']);
const isAdminTier = (r?: string | null) => r === 'admin' || r === 'superadmin';

// Change a member's role. Admin / Chairlady only — mirrored here and hard-enforced
// by the guard_profile_role_change() trigger, which raises if a non-admin (with a
// non-null auth.uid()) attempts a role change. The trigger is the real gate; the
// checks here fail fast with a redirect AND add governance guards the trigger
// does not cover (self-lockout, Chairlady stewardship, last-admin protection).
export async function setRole(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isAdmin(me?.role)) redirect('/staff');

  const memberId = String(formData.get('member_id') || '');
  const role = String(formData.get('role') || '');
  if (!memberId || !VALID_ROLES.has(role)) {
    redirect('/staff/roles');
  }

  // Guard 1 — you cannot change your OWN role. Prevents an admin from accidentally
  // demoting or locking themselves out; another admin / the Chairlady must do it.
  if (memberId === user.id) {
    redirect('/staff/roles?denied=self');
  }

  const { data: target } = await supabase.from('profiles').select('id, role').eq('id', memberId).single();
  if (!target) {
    redirect('/staff/roles?denied=1');
  }

  // Guard 2 — the Chairlady (superadmin) role is stewarded by the Chairlady only:
  // a plain Admin cannot mint another Chairlady, nor demote the sitting Chairlady.
  if ((role === 'superadmin' || target.role === 'superadmin') && me?.role !== 'superadmin') {
    redirect('/staff/roles?denied=chairlady');
  }

  // Guard 3 — never remove the last account that can manage roles: keep at least
  // one admin-tier (Admin or Chairlady) so the organisation cannot lock itself out.
  if (isAdminTier(target.role) && !isAdminTier(role)) {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .in('role', ['admin', 'superadmin']);
    if ((count ?? 0) <= 1) {
      redirect('/staff/roles?denied=lastadmin');
    }
  }

  const { error } = await supabase.from('profiles').update({ role }).eq('id', memberId);
  if (error) {
    console.error('setRole failed:', error.message);
    revalidatePath('/staff/roles');
    redirect('/staff/roles?denied=1');
  }

  revalidatePath('/staff/roles');
  redirect('/staff/roles?updated=1');
}
