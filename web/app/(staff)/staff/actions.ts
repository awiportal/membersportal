'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';

async function requireStaff() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) throw new Error('Not authorized');
  return { supabase, uid: user.id };
}

function refresh(id: string) {
  revalidatePath('/staff');
  revalidatePath(`/staff/members/${id}`);
}

// Approve + activate a member (Secretary/Admin/Chairlady).
export async function approveMember(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) return;
  const { supabase } = await requireStaff();

  const { data: p } = await supabase.from('profiles').select('joined_at').eq('id', id).single();
  await supabase
    .from('profiles')
    .update({
      status: 'active',
      kyc_status: 'approved',
      joined_at: p?.joined_at ?? new Date().toISOString(),
    })
    .eq('id', id);

  await supabase.from('kyc_documents').update({ status: 'approved' }).eq('member_id', id);
  await supabase.from('notifications').insert({
    member_id: id,
    type: 'approval',
    title: 'Membership approved',
    body: 'Welcome to AWIVEST. Your account is now active and your full portal is unlocked.',
  });

  refresh(id);
}

// Return a pack for changes (Secretary/Admin/Chairlady).
export async function rejectMember(formData: FormData) {
  const id = String(formData.get('id') || '');
  const reason = String(formData.get('reason') || '').trim();
  if (!id) return;
  const { supabase } = await requireStaff();

  await supabase
    .from('profiles')
    .update({ kyc_status: 'rejected', onboarding_step: 'review' })
    .eq('id', id);

  await supabase.from('notifications').insert({
    member_id: id,
    type: 'approval',
    title: 'Membership needs attention',
    body: reason
      ? `Your membership pack was returned: ${reason}`
      : 'Your membership pack was returned for review. Please check your details and resubmit.',
  });

  refresh(id);
}

// Activate / deactivate / archive an existing member.
export async function setMemberStatus(formData: FormData) {
  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');
  if (!id || !['active', 'inactive', 'archived', 'pending'].includes(status)) return;
  const { supabase } = await requireStaff();
  await supabase.from('profiles').update({ status }).eq('id', id);
  refresh(id);
}
