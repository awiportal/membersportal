'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';

const KINDS = ['next_of_kin', 'beneficiary', 'nominee'] as const;
type Kind = (typeof KINDS)[number];

// Any staff may maintain a member's designated people (clerical). RLS on
// member_relations re-checks (owner or is_staff()), so this is the UI gate only.
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

function clean(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

// Upsert one relation record (next of kin / beneficiary / nominee) for a member.
// There is exactly one row per (member_id, relation_kind) — enforced by a unique
// constraint — so onConflict keeps this idempotent. If every field is blank we
// treat Save as a clear rather than keeping an empty row.
export async function saveRelation(formData: FormData) {
  const memberId = String(formData.get('member_id') || '');
  const kind = String(formData.get('relation_kind') || '') as Kind;
  if (!memberId || !KINDS.includes(kind)) return;
  const { supabase, uid } = await requireStaff();

  const name = clean(formData.get('name'));
  const relationship = clean(formData.get('relationship'));
  const phone = clean(formData.get('phone'));
  const id_number = clean(formData.get('id_number'));

  if (!name && !relationship && !phone && !id_number) {
    await supabase.from('member_relations').delete().eq('member_id', memberId).eq('relation_kind', kind);
    await logRelation(supabase, uid, memberId, 'member_relation_cleared', { relation_kind: kind });
    revalidatePath(`/staff/members/${memberId}`);
    return;
  }

  const { error } = await supabase
    .from('member_relations')
    .upsert(
      { member_id: memberId, relation_kind: kind, name, relationship, phone, id_number },
      { onConflict: 'member_id,relation_kind' }
    );
  if (error) {
    console.error('saveRelation failed:', error.message);
    return;
  }

  await logRelation(supabase, uid, memberId, 'member_relation_saved', { relation_kind: kind, name });
  revalidatePath(`/staff/members/${memberId}`);
}

// Remove one relation record.
export async function clearRelation(formData: FormData) {
  const memberId = String(formData.get('member_id') || '');
  const kind = String(formData.get('relation_kind') || '') as Kind;
  if (!memberId || !KINDS.includes(kind)) return;
  const { supabase, uid } = await requireStaff();

  const { error } = await supabase
    .from('member_relations')
    .delete()
    .eq('member_id', memberId)
    .eq('relation_kind', kind);
  if (error) {
    console.error('clearRelation failed:', error.message);
    return;
  }

  await logRelation(supabase, uid, memberId, 'member_relation_cleared', { relation_kind: kind });
  revalidatePath(`/staff/members/${memberId}`);
}

// Best-effort audit trail — visible in the admin audit log. A staff insert is
// permitted by the audit_staff_insert RLS policy; failures never block the save.
async function logRelation(supabase: any, uid: string, memberId: string, action: string, meta: any) {
  try {
    await supabase.from('audit_log').insert({ actor_id: uid, member_id: memberId, action, meta });
  } catch {
    /* ignore */
  }
}
