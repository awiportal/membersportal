'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isStaff, isAdmin } from '@/lib/roles';

const MEETING_TYPES = ['agm', 'committee', 'general', 'special', 'other'];
const MEETING_STATUS = ['scheduled', 'held', 'cancelled'];
const ATT_STATUS = ['present', 'absent', 'apology'];
const AI_STATUS = ['open', 'done', 'cancelled'];

// Any staff may run the meeting register (clerical/governance). RLS re-checks.
async function requireStaff() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) throw new Error('Not authorized');
  return { supabase, uid: user.id, role: me?.role as string | undefined };
}

const val = (v: FormDataEntryValue | null): string | null => {
  const t = String(v ?? '').trim();
  return t ? t : null;
};

function refresh(id?: string | null) {
  revalidatePath('/staff/meetings');
  if (id) revalidatePath(`/staff/meetings/${id}`);
}

// Best-effort audit trail — permitted by the audit_staff_insert policy.
async function audit(supabase: any, uid: string, action: string, meta: any) {
  try {
    await supabase.from('audit_log').insert({ actor_id: uid, action, meta });
  } catch {
    /* ignore */
  }
}

export async function createMeeting(formData: FormData) {
  const { supabase, uid } = await requireStaff();
  const title = val(formData.get('title'));
  if (!title) return;
  const mt = String(formData.get('meeting_type') || '');
  const meeting_type = MEETING_TYPES.includes(mt) ? mt : 'committee';
  const scheduled_at = val(formData.get('scheduled_at'));
  const location = val(formData.get('location'));

  const { data, error } = await supabase
    .from('meetings')
    .insert({ title, meeting_type, scheduled_at, location, created_by: uid })
    .select('id')
    .single();
  if (error || !data) {
    console.error('createMeeting failed:', error?.message);
    return;
  }
  await audit(supabase, uid, 'meeting_created', { meeting_id: data.id, title });
  revalidatePath('/staff/meetings');
  redirect(`/staff/meetings/${data.id}`);
}

export async function updateMeetingDetails(formData: FormData) {
  const { supabase, uid } = await requireStaff();
  const id = val(formData.get('id'));
  if (!id) return;
  const patch: any = {
    scheduled_at: val(formData.get('scheduled_at')),
    location: val(formData.get('location')),
  };
  const title = val(formData.get('title'));
  if (title) patch.title = title;
  const mt = String(formData.get('meeting_type') || '');
  if (MEETING_TYPES.includes(mt)) patch.meeting_type = mt;
  const st = String(formData.get('status') || '');
  if (MEETING_STATUS.includes(st)) patch.status = st;

  const { error } = await supabase.from('meetings').update(patch).eq('id', id);
  if (error) {
    console.error('updateMeetingDetails failed:', error.message);
    return;
  }
  await audit(supabase, uid, 'meeting_updated', { meeting_id: id });
  refresh(id);
}

export async function saveAgenda(formData: FormData) {
  const { supabase, uid } = await requireStaff();
  const id = val(formData.get('id'));
  if (!id) return;
  const agenda = String(formData.get('agenda') ?? '');
  const { error } = await supabase.from('meetings').update({ agenda }).eq('id', id);
  if (error) {
    console.error('saveAgenda failed:', error.message);
    return;
  }
  await audit(supabase, uid, 'meeting_agenda_saved', { meeting_id: id });
  refresh(id);
}

export async function saveMinutes(formData: FormData) {
  const { supabase, uid } = await requireStaff();
  const id = val(formData.get('id'));
  if (!id) return;
  const minutes = String(formData.get('minutes') ?? '');
  const { error } = await supabase.from('meetings').update({ minutes }).eq('id', id);
  if (error) {
    console.error('saveMinutes failed:', error.message);
    return;
  }
  await audit(supabase, uid, 'meeting_minutes_saved', { meeting_id: id });
  refresh(id);
}

export async function deleteMeeting(formData: FormData) {
  const { supabase, uid, role } = await requireStaff();
  if (!isAdmin(role)) throw new Error('Not authorized');
  const id = val(formData.get('id'));
  if (!id) return;
  await supabase.from('meetings').delete().eq('id', id);
  await audit(supabase, uid, 'meeting_deleted', { meeting_id: id });
  revalidatePath('/staff/meetings');
  redirect('/staff/meetings');
}

export async function addAttendance(formData: FormData) {
  const { supabase } = await requireStaff();
  const meeting_id = val(formData.get('meeting_id'));
  if (!meeting_id) return;
  const member_id = val(formData.get('member_id'));
  const name = val(formData.get('name'));
  const stV = String(formData.get('status') || 'present');
  const status = ATT_STATUS.includes(stV) ? stV : 'present';
  if (!member_id && !name) return;

  if (member_id) {
    const { data: existing } = await supabase
      .from('meeting_attendance')
      .select('id')
      .eq('meeting_id', meeting_id)
      .eq('member_id', member_id)
      .maybeSingle();
    if (existing?.id) {
      await supabase.from('meeting_attendance').update({ status, name }).eq('id', existing.id);
    } else {
      await supabase.from('meeting_attendance').insert({ meeting_id, member_id, name, status });
    }
  } else {
    await supabase.from('meeting_attendance').insert({ meeting_id, name, status });
  }
  refresh(meeting_id);
}

export async function setAttendanceStatus(formData: FormData) {
  const { supabase } = await requireStaff();
  const id = val(formData.get('id'));
  const meeting_id = val(formData.get('meeting_id'));
  const stV = String(formData.get('status') || '');
  if (!id || !ATT_STATUS.includes(stV)) return;
  await supabase.from('meeting_attendance').update({ status: stV }).eq('id', id);
  refresh(meeting_id);
}

export async function removeAttendance(formData: FormData) {
  const { supabase } = await requireStaff();
  const id = val(formData.get('id'));
  const meeting_id = val(formData.get('meeting_id'));
  if (!id) return;
  await supabase.from('meeting_attendance').delete().eq('id', id);
  refresh(meeting_id);
}

export async function addActionItem(formData: FormData) {
  const { supabase, uid } = await requireStaff();
  const meeting_id = val(formData.get('meeting_id'));
  if (!meeting_id) return;
  const description = val(formData.get('description'));
  if (!description) return;
  const assignee_id = val(formData.get('assignee_id'));
  const due_date = val(formData.get('due_date'));
  await supabase
    .from('meeting_action_items')
    .insert({ meeting_id, description, assignee_id, due_date });
  await audit(supabase, uid, 'meeting_action_added', { meeting_id, description });
  refresh(meeting_id);
}

export async function setActionItemStatus(formData: FormData) {
  const { supabase } = await requireStaff();
  const id = val(formData.get('id'));
  const meeting_id = val(formData.get('meeting_id'));
  const stV = String(formData.get('status') || '');
  if (!id || !AI_STATUS.includes(stV)) return;
  await supabase.from('meeting_action_items').update({ status: stV }).eq('id', id);
  refresh(meeting_id);
}

export async function removeActionItem(formData: FormData) {
  const { supabase } = await requireStaff();
  const id = val(formData.get('id'));
  const meeting_id = val(formData.get('meeting_id'));
  if (!id) return;
  await supabase.from('meeting_action_items').delete().eq('id', id);
  refresh(meeting_id);
}
