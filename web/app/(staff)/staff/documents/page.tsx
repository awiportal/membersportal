import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canViewStaffConsole } from '@/lib/roles';
import DocumentManager from './DocumentManager';
import PublishedDocuments from './PublishedDocuments';

export const dynamic = 'force-dynamic';

export default async function StaffDocuments() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!canViewStaffConsole(me?.role)) redirect('/dashboard');

  const admin = createAdminClient();
  const [{ data: docs }, { data: members }] = await Promise.all([
    admin.from('documents').select('id, title, type, member_id, created_at').order('created_at', { ascending: false }),
    admin.from('profiles').select('id, full_name, investor_id').order('full_name', { ascending: true }),
  ]);

  const memberMap = new Map(((members ?? []) as any[]).map((m) => [m.id, m]));
  const rows = ((docs ?? []) as any[]).map((d) => ({
    id: d.id as string,
    title: (d.title || '') as string,
    type: (d.type || 'other') as string,
    member_id: (d.member_id ?? null) as string | null,
    created_at: (d.created_at ?? null) as string | null,
    memberLabel: d.member_id
      ? memberMap.get(d.member_id)?.full_name || memberMap.get(d.member_id)?.investor_id || 'Member'
      : null,
  }));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-title">Document Centre</div>
      <div className="sub">
        Publish statements, certificates, policies and guides. Share with every member, or send a document to one
        member&apos;s account. Members open these securely from their portal.
      </div>

      <div style={{ marginTop: 20 }}>
        <DocumentManager members={(members ?? []) as any} />
      </div>

      <PublishedDocuments docs={rows} />
    </div>
  );
}
