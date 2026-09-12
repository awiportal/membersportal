import { createClient } from '@/lib/supabase/server';
import AgreementSigner from './AgreementSigner';

export const dynamic = 'force-dynamic';

export default async function AgreementsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  const [{ data: profile }, { data: docRows }, { data: accRows }] = await Promise.all([
    supabase.from('profiles').select('esign_status, esign_signed_at').eq('id', uid).single(),
    supabase.from('agreement_documents').select('*').eq('active', true).order('sort_order', { ascending: true }),
    supabase.from('agreement_acceptances').select('*').eq('member_id', uid),
  ]);
  const docs = (docRows ?? []) as any[];
  const accByDoc: Record<string, any> = {};
  ((accRows ?? []) as any[]).forEach((a) => {
    accByDoc[a.agreement_id] = a;
  });
  const esignDone = profile?.esign_status === 'completed';
  const esignDate = profile?.esign_signed_at ? new Date(profile.esign_signed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  // Public URLs for additional agreement documents. The 'agreements' bucket is
  // PUBLIC (blank templates, no member data). createSignedUrl() needs a storage
  // SELECT policy that members do not have and returned nothing for them, so we
  // build public URLs instead — consistent with onboarding and signedPdf.ts.
  const publicUrlByDoc: Record<string, string | undefined> = {};
  docs.forEach((d) => {
    if (!d.file_path) return;
    publicUrlByDoc[d.id] = supabase.storage.from('agreements').getPublicUrl(d.file_path).data.publicUrl;
  });

  return (
    <div>
      <div className="page-title">Agreements</div>
      <div className="sub">
        Your membership agreement and any additional documents to sign, with an audit trail. <span className="badge badge-good">Live</span>
      </div>

      {/* Membership agreement (PandaDoc e-sign, completed during onboarding) */}
      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="ic" style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--surface2)', color: 'var(--lime2)' }}>
              <i className="fa-solid fa-file-contract" />
            </span>
            <div>
              <div style={{ fontWeight: 700 }}>AWI Membership Agreement, T&amp;Cs &amp; Confidentiality</div>
              <div className="muted" style={{ fontSize: 12 }}>{esignDone ? `Completed via PandaDoc${esignDate ? ` · ${esignDate}` : ''}` : 'Signed once during onboarding'}</div>
            </div>
          </div>
          {esignDone ? (
            <span className="badge badge-good"><i className="fa-solid fa-circle-check" /> Signed</span>
          ) : (
            <span className="badge badge-warn">Not yet signed</span>
          )}
        </div>
      </div>

      {/* Additional / one-off agreements published by the office */}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {docs.length === 0 ? (
          <div className="card card-pad">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Additional agreements</div>
            <div className="muted" style={{ fontSize: 13 }}>If the office sends you an additional agreement to sign, it will appear here.</div>
          </div>
        ) : (
          docs.map((d) => {
            const acc = accByDoc[d.id];
            // The 'agreements' bucket is public, so a public URL opens the
            // unsigned document reliably (no per-member storage policy needed).
            const viewUrl = publicUrlByDoc[d.id];
            return (
              <div key={d.id} className="card card-pad">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span className="ic" style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: 'var(--lime2)' }}>
                      <i className="fa-solid fa-file-signature" />
                    </span>
                    <div>
                      <div style={{ fontWeight: 700 }}>{d.title}{d.required ? '' : ' (optional)'}</div>
                      {d.description ? <div className="muted" style={{ fontSize: 12 }}>{d.description}</div> : null}
                    </div>
                  </div>
                  {acc ? (
                    <span className="badge badge-good" title={acc.signed_at ? new Date(acc.signed_at).toLocaleString() : undefined}>
                      <i className="fa-solid fa-signature" /> {acc.signed_name}
                    </span>
                  ) : (
                    <span className="badge badge-warn">Not signed</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  {acc ? (
                    <>
                      <a href={`/agreements/download/${acc.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-lime btn-sm">
                        <i className="fa-solid fa-file-circle-check" /> View signed document
                      </a>
                      <a href={`/agreements/download/${acc.id}?download=1`} className="btn btn-ghost btn-sm">
                        <i className="fa-solid fa-download" /> Download
                      </a>
                    </>
                  ) : viewUrl ? (
                    <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                      <i className="fa-solid fa-arrow-up-right-from-square" /> View document
                    </a>
                  ) : null}
                </div>

                {!acc && <AgreementSigner agreementId={d.id} />}

                {acc && acc.signature_image && (
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={acc.signature_image} alt="Signature" style={{ height: 56, maxWidth: 220, background: '#ffffff', borderRadius: 8, padding: 6, border: '1px solid var(--border)' }} />
                    <div className="muted" style={{ fontSize: 12 }}>
                      Signed by <strong style={{ color: 'var(--text)' }}>{acc.signed_name}</strong>
                      {acc.signed_at ? ' on ' + new Date(acc.signed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
