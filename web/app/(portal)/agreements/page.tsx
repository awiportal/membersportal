import { createClient } from '@/lib/supabase/server';
import { signAgreementDoc } from './actions';

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

  // Short-lived signed URLs for additional agreement documents. The 'agreements'
  // bucket is private, so we mint per-request signed URLs rather than public ones.
  const signedUrlByDoc: Record<string, string | undefined> = {};
  await Promise.all(
    docs.map(async (d) => {
      if (!d.file_path) return;
      const { data } = await supabase.storage.from('agreements').createSignedUrl(d.file_path, 3600);
      signedUrlByDoc[d.id] = data?.signedUrl;
    })
  );

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
            // The 'agreements' bucket is private, so the pre-signed URL minted
            // above is the only way to open an unsigned document — a public URL
            // would 404 against a private bucket.
            const viewUrl = signedUrlByDoc[d.id];
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
                <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
                  {!acc && (
                    <form action={signAgreementDoc} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', flex: 1, minWidth: 240 }}>
                      <input type="hidden" name="agreement_id" value={d.id} />
                      <div className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
                        <label>Sign by typing your full name</label>
                        <input className="input" name="signed_name" placeholder="Your full name" required />
                      </div>
                      <button className="btn btn-lime btn-sm" type="submit"><i className="fa-solid fa-signature" /> Sign</button>
                    </form>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
