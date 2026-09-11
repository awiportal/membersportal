import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isStaff } from '@/lib/roles';
import KycReview from './KycReview';

export const dynamic = 'force-dynamic';

export default async function StaffKyc() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!isStaff(me?.role)) redirect('/dashboard');

  const admin = createAdminClient();
  const { data: docs } = await admin
    .from('kyc_documents')
    .select('id, member_id, doc_type, status, comment, uploaded_at, reviewed_at')
    .order('uploaded_at', { ascending: false });

  const memberIds = Array.from(new Set(((docs ?? []) as any[]).map((d) => d.member_id)));
  const membersRes = memberIds.length
    ? await admin.from('profiles').select('id, full_name, investor_id, member_type, kyc_status, avatar_url, email').in('id', memberIds)
    : { data: [] as any[] };
  const members = (membersRes.data ?? []) as any[];
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const groups = memberIds
    .map((id) => {
      const member =
        memberMap.get(id) || { id, full_name: null, investor_id: null, member_type: 'individual', kyc_status: null };
      const mdocs = ((docs ?? []) as any[]).filter((d) => d.member_id === id);
      const anyPending = mdocs.some((d) => d.status === 'pending');
      return { member, docs: mdocs, anyPending };
    })
    .sort((a, b) => Number(b.anyPending) - Number(a.anyPending));

  return <KycReview groups={groups as any} />;
}
