'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/roles';

const CATEGORIES = ['announcement', 'news', 'event', 'update'];

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

function refresh() {
  revalidatePath('/staff/information');
  revalidatePath('/information');
}

function parse(fd: FormData) {
  const rawCat = String(fd.get('category') || 'announcement');
  const category = CATEGORIES.includes(rawCat) ? rawCat : 'announcement';
  const eventAtRaw = String(fd.get('event_at') || '').trim();
  return {
    category,
    title: String(fd.get('title') || '').trim(),
    body: String(fd.get('body') || '').trim(),
    link_url: String(fd.get('link_url') || '').trim() || null,
    event_at: category === 'event' && eventAtRaw ? new Date(eventAtRaw).toISOString() : null,
    event_location: category === 'event' ? String(fd.get('event_location') || '').trim() || null : null,
    pinned: fd.get('pinned') != null,
    published: fd.get('published') != null,
  };
}

// ---- Notify members of a PUBLISHED Information Center post ------------------
type PostForNotice = {
  id: string;
  category: string;
  title: string;
  body: string;
  event_at: string | null;
  event_location: string | null;
};

function announcementNotice(p: PostForNotice) {
  const label =
    p.category === 'event'
      ? 'New event'
      : p.category === 'news'
        ? 'AWIVEST news'
        : p.category === 'update'
          ? 'Update'
          : 'Announcement';
  const title = `${label}: ${p.title}`;
  let body = (p.body || '').trim();
  if (p.category === 'event' && p.event_at) {
    const when = new Date(p.event_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    const where = p.event_location ? ` \u00b7 ${p.event_location}` : '';
    body = `${when}${where}${body ? ` \u2014 ${body}` : ''}`;
  }
  if (body.length > 160) body = `${body.slice(0, 157).trimEnd()}\u2026`;
  return { title, body };
}

// Fan a PUBLISHED post out to members who opted in to "AWIVEST news & events"
// (profiles.notification_prefs.marketing === true). Deduped one-per-announcement
// by the unique (member_id, announcement_id) index, so re-saving a published
// post never double-notifies. Best-effort — never blocks the post itself.
async function notifyMembersOfPost(
  supabase: ReturnType<typeof createClient>,
  post: PostForNotice,
  actorId?: string,
) {
  try {
    let q = supabase.from('profiles').select('id').eq('notification_prefs->>marketing', 'true');
    if (actorId) q = q.neq('id', actorId);
    const { data: recips } = await q;
    if (!recips?.length) return;
    const { title, body } = announcementNotice(post);
    const rows = recips.map((r: { id: string }) => ({
      member_id: r.id,
      type: post.category,
      title,
      body,
      link_url: '/information',
      announcement_id: post.id,
    }));
    await supabase
      .from('notifications')
      .upsert(rows, { onConflict: 'member_id,announcement_id', ignoreDuplicates: true });
  } catch (e) {
    console.error('notifyMembersOfPost failed', e);
  }
}

export async function createPost(formData: FormData) {
  const { supabase, uid } = await requireStaff();
  const p = parse(formData);
  if (!p.title) return;
  const { data, error } = await supabase
    .from('announcements')
    .insert({ ...p, published_at: p.published ? new Date().toISOString() : null, created_by: uid })
    .select('id')
    .single();
  if (!error && data) {
    await supabase.from('audit_log').insert({
      actor_id: uid,
      action: p.published ? 'announcement_published' : 'announcement_created',
      meta: { id: data.id, title: p.title, category: p.category },
    });
    if (p.published) {
      await notifyMembersOfPost(
        supabase,
        {
          id: data.id,
          category: p.category,
          title: p.title,
          body: p.body,
          event_at: p.event_at,
          event_location: p.event_location,
        },
        uid,
      );
    }
  }
  refresh();
}

export async function updatePost(formData: FormData) {
  const { supabase, uid } = await requireStaff();
  const id = String(formData.get('id') || '');
  if (!id) return;
  const p = parse(formData);
  if (!p.title) return;
  // Keep the original publish time on re-save; stamp it when first published.
  const { data: existing } = await supabase.from('announcements').select('published_at').eq('id', id).maybeSingle();
  const published_at = p.published ? existing?.published_at || new Date().toISOString() : null;
  await supabase.from('announcements').update({ ...p, published_at }).eq('id', id);
  if (p.published) {
    await notifyMembersOfPost(
      supabase,
      {
        id,
        category: p.category,
        title: p.title,
        body: p.body,
        event_at: p.event_at,
        event_location: p.event_location,
      },
      uid,
    );
  }
  refresh();
}

export async function togglePublish(formData: FormData) {
  const { supabase, uid } = await requireStaff();
  const id = String(formData.get('id') || '');
  if (!id) return;
  const publish = String(formData.get('publish') || '') === 'true';
  await supabase
    .from('announcements')
    .update({ published: publish, published_at: publish ? new Date().toISOString() : null })
    .eq('id', id);
  await supabase.from('audit_log').insert({
    actor_id: uid,
    action: publish ? 'announcement_published' : 'announcement_unpublished',
    meta: { id },
  });
  if (publish) {
    const { data: a } = await supabase
      .from('announcements')
      .select('id, category, title, body, event_at, event_location')
      .eq('id', id)
      .single();
    if (a) {
      await notifyMembersOfPost(
        supabase,
        {
          id: a.id,
          category: a.category,
          title: a.title,
          body: a.body ?? '',
          event_at: a.event_at ?? null,
          event_location: a.event_location ?? null,
        },
        uid,
      );
    }
  }
  refresh();
}

export async function togglePin(formData: FormData) {
  const { supabase } = await requireStaff();
  const id = String(formData.get('id') || '');
  if (!id) return;
  const pin = String(formData.get('pin') || '') === 'true';
  await supabase.from('announcements').update({ pinned: pin }).eq('id', id);
  refresh();
}

export async function deletePost(formData: FormData) {
  const { supabase, uid } = await requireStaff();
  const id = String(formData.get('id') || '');
  if (!id) return;
  await supabase.from('announcements').delete().eq('id', id);
  await supabase.from('audit_log').insert({ actor_id: uid, action: 'announcement_deleted', meta: { id } });
  refresh();
}
