import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import MemberSignRequests from './MemberSignRequests';

export const dynamic = 'force-dynamic';

export default async function MemberSignRequestsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  // The member's own recipient rows (admin client, filtered by member_id), then
  // the parent request info for each.
  const admin = createAdminClient();
  const { data: rcptRows } = await admin
    .from('sign_request_recipients')
    .select('*')
    .eq('member_id', uid)
    .order('created_at', { ascending: false });
  const recipients = ((rcptRows ?? []) as any[]);

  const reqIds = Array.from(new Set(recipients.map((r) => r.request_id).filter(Boolean)));
  const { data: reqRows } = reqIds.length
    ? await admin.from('sign_requests').select('id, title, doc_type, note').in('id', reqIds)
    : { data: [] as any[] };
  const reqById: Record<string, any> = {};
  ((reqRows ?? []) as any[]).forEach((r) => (reqById[r.id] = r));

  const items = recipients.map((r) => {
    const req = reqById[r.request_id] || {};
    return {
      id: r.id,
      status: r.status,
      title: req.title || 'Document',
      doc_type: req.doc_type || 'other',
      note: req.note || null,
      member_signed_name: r.member_signed_name,
      countersigned_name: r.countersigned_name,
    };
  });

  return <MemberSignRequests items={items} />;
}
