import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isStaff } from '@/lib/roles';
import DocumentManager from './DocumentManager';
import { deleteDocument } from './actions';

export const dynamic = 'force-dynamic';

export default async function StaffDocuments() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (\!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (\!isStaff(me?.role)) redirect('/dashboard');

  const admin = createAdminClient();
  const [{ data: docs }, { data: members }] = await Promise.all([
    admin.from('documents').select('id, title, type, member_id, created_at').order('created_at', { ascending: false }),
    admin.from('profiles').select('id, full_name, investor_id').order('full_name', { ascending: true }),
  ]);

  const memberMap = new Map(((members ?? []) as any[]).map((m) => [m.id, m]));
  const rows = ((docs ?? []) as any[]).map((d) => ({
    ...d,
    memberLabel: d.member_id
      ? memberMap.get(d.member_id)?.full_name || memberMap.get(d.member_id)?.investor_id || 'Member'
      : null,
  }));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-title">Document Centre</div>
      <div className="sub">
        Publish statements, certificates, policies and guides. Share with every member, or send a document to one
        member's account. Members open these securely from their portal.
      </div>

      <div style={{ marginTop: 20 }}>
        <DocumentManager members={(members ?? []) as any} />
      </div>

      <div className="card card-pad">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Published documents</div>
        {rows.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>
            No documents yet. Upload your first one above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map((d) => (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: 14,
                  borderRadius: 14,
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'var(--surface)',
                    color: 'var(--purple2)',
                  }}
                >
                  <i className="fa-solid fa-folder-open" />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600 }}>{d.title}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span className="badge badge-info" style={{ fontSize: 11 }}>
                      {d.type}
                    </span>
                    <span className={`badge ${d.member_id ? 'badge-purple' : 'badge-good'}`} style={{ fontSize: 11 }}>
                      {d.member_id ? `For ${d.memberLabel}` : 'All members'}
                    </span>
                  </div>
                </div>
                <form action={deleteDocument}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="btn btn-ghost btn-sm" type="submit" style={{ color: '#ff8a8a' }}>
                    <i className="fa-solid fa-trash" />
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
