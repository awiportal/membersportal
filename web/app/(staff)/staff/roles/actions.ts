'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/roles';

const VALID_ROLES = new Set(['member', 'secretary', 'admin', 'superadmin']);

// Change a member's role. Admin / Chairlady only — mirrored here and hard-enforced
// by the guard_profile_role_change() trigger, which raises if a non-admin (with a
// non-null auth.uid()) attempts a role change. The trigger is the real gate; this
// check just fails fast with a redirect.
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

  const { error } = await supabase.from('profiles').update({ role }).eq('id', memberId);
  if (error) {
    console.error('setRole failed:', error.message);
    revalidatePath('/staff/roles');
    redirect('/staff/roles?denied=1');
  }

  revalidatePath('/staff/roles');
  redirect('/staff/roles?updated=1');
}
