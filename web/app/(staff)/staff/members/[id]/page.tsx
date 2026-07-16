import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { roleLabel, statusLabel } from '@/lib/roles';
import { KYC_DOC_TYPES } from '@/lib/onboarding';
import { approveMember, rejectMember, setMemberStatus } from '../../actions';

export const dynamic = 'force-dynamic';

const REL_LABEL: Record<string, string> = {
  next_of_kin: 'Next of kin',
  beneficiary: 'Beneficiary',
  nominee: 'Nominee',
};

export default async function MemberDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const id = params.id;

  const [{ data: m }, { data: relations }, { data: docs }, { data: agreements }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('member_relations').select('*').eq('member_id', id),
    supabase.from('kyc_documents').select('*').eq('member_id', id).order('uploaded_at', { ascending: false }),
    supabase.from('agreements').select('*').eq('member_id', id),
  ]);
  if (!m) notFound();

  const docsWithUrls = await Promise.all(
    ((docs ?? []) as any[]).map(async (d) => {
      const { data } = await supabase.storage.from('kyc').createSignedUrl(d.file_path, 3600);
      return { ...d, url: (data?.signedUrl as string | undefined) };
    })
  );
  const docByType: Record<string, any> = {};
  docsWithUrls.forEach((d) => (docByType[d.doc_type] = d));
  const relMap: Record<string, any> = {};
  ((relations ?? []) as any[]).forEach((r) => (relMap[r.relation_kind] = r));
  const agreementSigned = ((agreements ?? []) as any[]).some((a) => a.status === 'completed');

  const Row = ({ k, v }: { k: string; v: any }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5 }}>
      <span className="muted">{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{v || '—'}</span>
    </div>
  );
  const rel = (k: string) => {
    const r = relMap[k];
    if (!r || !r.name) return '—';
    return `${r.name}${r.relationship ? ` (${r.relationship})` : ''}${r.phone ? ` · ${r.phone}` : ''}${r.id_number ? ` · ID ${r.id_number}` : ''}`;
  };

  const statusCls =
    m.status === 'active' ? 'badge-good' : m.status === 'pending' ? 'badge-warn' : m.status === 'archived' ? 'badge-purple' : 'badge-bad';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Link href="/staff" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}><i className="fa-solid fa-arrow-left" /> Back</Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div className="page-title">{m.full_name || m.email || 'Member'}</div>
          <div className="sub">{m.investor_id || 'No Investor ID yet'} · {m.email}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge badge-info">{roleLabel(m.role)}</span>
          <span className={`badge ${statusCls}`}>{statusLabel(m.status)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Decision</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {m.status !== 'active' && (
            <form action={approveMember}>
              <input type="hidden" name="id" value={m.id} />
              <button className="btn btn-lime" type="submit"><i className="fa-solid fa-check" /> Approve &amp; activate</button>
            </form>
          )}
          {m.status === 'active' && (
            <form action={setMemberStatus}>
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="status" value="inactive" />
              <button className="btn btn-ghost" type="submit"><i className="fa-solid fa-user-slash" /> Deactivate</button>
            </form>
          )}
          {m.status === 'inactive' && (
            <form action={setMemberStatus}>
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="status" value="active" />
              <button className="btn btn-ghost" type="submit"><i className="fa-solid fa-user-check" /> Reactivate</button>
            </form>
          )}
        </div>
        <form action={rejectMember} style={{ marginTop: 14 }}>
          <input type="hidden" name="id" value={m.id} />
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Return pack for changes (optional note to the member)</label>
            <input className="input" name="reason" placeholder="e.g. KRA PIN certificate is unclear — please re-upload" />
          </div>
          <button className="btn btn-ghost btn-sm" type="submit"><i className="fa-solid fa-rotate-left" /> Return for changes</button>
        </form>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
        {/* Personal */}
        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Personal details</div>
          <Row k="Full name" v={m.full_name} />
          <Row k="ID / Passport no." v={m.national_id} />
          <Row k="KRA PIN" v={m.kra_pin} />
          <Row k="Date of birth" v={m.date_of_birth} />
          <Row k="Phone" v={m.phone} />
          <Row k="Postal address" v={m.postal_address} />
          <Row k="Physical address" v={m.physical_address} />
          <div style={{ marginTop: 14, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Relations</div>
          {(['next_of_kin', 'beneficiary', 'nominee'] as const).map((k) => (
            <Row key={k} k={REL_LABEL[k]} v={rel(k)} />
          ))}
        </div>

        {/* Documents + agreement */}
        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>KYC documents</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {KYC_DOC_TYPES.map((t) => {
              const d = docByType[t.key];
              return (
                <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: d ? 'rgba(55,201,138,0.16)' : 'var(--surface)', color: d ? '#7ef0bf' : 'var(--muted2)' }}>
                    <i className={`fa-solid ${d ? 'fa-file-circle-check' : 'fa-file'}`} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.label}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>{d ? statusLabel(d.status) : 'Not uploaded'}</div>
                  </div>
                  {d?.url && (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">View</a>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, fontWeight: 700, fontSize: 14 }}>Agreement</div>
          <div style={{ marginTop: 8 }}>
            <span className={`badge ${agreementSigned ? 'badge-good' : 'badge-warn'}`}>
              <i className={`fa-solid ${agreementSigned ? 'fa-circle-check' : 'fa-clock'}`} /> {agreementSigned ? 'Membership packet accepted' : 'Not accepted yet'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
