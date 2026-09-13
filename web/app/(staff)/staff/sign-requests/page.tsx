import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canViewStaffConsole, isAdmin } from '@/lib/roles';
import StaffSignRequests from './StaffSignRequests';

export const dynamic = 'force-dynamic';

export default async function StaffSignRequestsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!canViewStaffConsole((me as any)?.role)) redirect('/staff');

  // All privileged reads use the service-role client (RLS only grants members
  // their own rows).
  const admin = createAdminClient();

  const { data: reqRows } = await admin
    .from('sign_requests')
    .select('*')
    .order('created_at', { ascending: false });
  const requests = ((reqRows ?? []) as any[]);
  const reqIds = requests.map((r) => r.id);

  const { data: rcptRows } = reqIds.length
    ? await admin.from('sign_request_recipients').select('*').in('request_id', reqIds)
    : { data: [] as any[] };
  const recipients = ((rcptRows ?? []) as any[]);

  const memberIds = Array.from(new Set(recipients.map((r) => r.member_id).filter(Boolean)));
  const { data: memRows } = memberIds.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', memberIds)
    : { data: [] as any[] };
  const memberById: Record<string, any> = {};
  ((memRows ?? []) as any[]).forEach((m) => (memberById[m.id] = m));

  // Active members for the recipient picker.
  const { data: activeRows } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('status', 'active')
    .eq('role', 'member')
    .order('full_name', { ascending: true });
  const activeMembers = ((activeRows ?? []) as any[]).map((m) => ({
    id: m.id,
    full_name: m.full_name,
    email: m.email,
  }));

  const recipientsByReq: Record<string, any[]> = {};
  recipients.forEach((r) => {
    const m = memberById[r.member_id];
    const item = { ...r, member_name: m?.full_name || 'Member', member_email: m?.email || '' };
    (recipientsByReq[r.request_id] = recipientsByReq[r.request_id] || []).push(item);
  });

  const data = requests.map((r) => ({
    id: r.id,
    title: r.title,
    doc_type: r.doc_type,
    note: r.note,
    created_at: r.created_at,
    recipients: recipientsByReq[r.id] || [],
  }));

  return (
    <StaffSignRequests requests={data} activeMembers={activeMembers} canSend={isAdmin((me as any)?.role)} />
  );
}
