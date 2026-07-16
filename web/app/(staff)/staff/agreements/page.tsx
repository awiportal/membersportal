import { createClient } from '@/lib/supabase/server';
import AgreementAdder from './AgreementAdder';
import { setAgreementActive, setAgreementRequired, deleteAgreement } from './actions';

export const dynamic = 'force-dynamic';

export default async function StaffAgreements() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = await supabase
    .from('agreement_documents')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  const docs = ((rows ?? []) as any[]).map((d) => ({
    ...d,
    url: supabase.storage.from('agreements').getPublicUrl(d.file_path).data.publicUrl,
  }));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-title">Membership agreements</div>
      <div className="sub">Publish the documents every new member must read and sign during onboarding. Changes appear to members immediately.</div>

      <div style={{ marginTop: 20 }}>
        <AgreementAdder userId={user?.id ?? ''} />
      </div>

      <div className="card card-pad">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Published agreements</div>
        {docs.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No agreements yet. Add your first one above — until then, members can proceed without signing.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {docs.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: 'var(--purple2)' }}>
                  <i className="fa-solid fa-file-contract" />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600 }}>{d.title}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{d.description || d.file_name || 'Document'}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span className={`badge ${d.required ? 'badge-purple' : 'badge-info'}`} style={{ fontSize: 11 }}>{d.required ? 'Required' : 'Optional'}</span>
                    <span className={`badge ${d.active ? 'badge-good' : 'badge-bad'}`} style={{ fontSize: 11 }}>{d.active ? 'Visible to members' : 'Hidden'}</span>
                  </div>
                </div>
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">View</a>
                <form action={setAgreementRequired}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="required" value={d.required ? 'false' : 'true'} />
                  <button className="btn btn-ghost btn-sm" type="submit">{d.required ? 'Make optional' : 'Make required'}</button>
                </form>
                <form action={setAgreementActive}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="active" value={d.active ? 'false' : 'true'} />
                  <button className="btn btn-ghost btn-sm" type="submit">{d.active ? 'Hide' : 'Show'}</button>
                </form>
                <form action={deleteAgreement}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="btn btn-ghost btn-sm" type="submit" style={{ color: '#ff8a8a' }}><i className="fa-solid fa-trash" /></button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
