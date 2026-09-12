import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/session';
import { displayRole, statusLabel, canApproveMembers, canDisburseFunds, canMapMembership } from '@/lib/roles';
import { KES } from '@/lib/format';
import { KYC_DOC_TYPES } from '@/lib/onboarding';
import { pandadocConfigured, getEsignSummary } from '@/lib/pandadoc';
import { approveMember, rejectMember, setMemberStatus, linkFundRecord, unlinkFundRecord, recordWithdrawal } from '../../actions';
import OneOffAgreement from './OneOffAgreement';
import RelationsEditor from './RelationsEditor';

export const dynamic = 'force-dynamic';

const REL_LABEL: Record<string, string> = {
  next_of_kin: 'Next of kin',
  beneficiary: 'Beneficiary',
  nominee: 'Nominee',
};

export default async function MemberDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const id = params.id;

  // The signed-in staff member's own role gates which controls appear below.
  const viewerProfile = await getSessionProfile();
  const viewerRole = viewerProfile?.role as string | undefined;

  const [{ data: m }, { data: relations }, { data: docs }, { data: agrDocs }, { data: acceptances }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('member_relations').select('*').eq('member_id', id),
    supabase.from('kyc_documents').select('*').eq('member_id', id).order('uploaded_at', { ascending: false }),
    supabase.from('agreement_documents').select('*').eq('active', true).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('agreement_acceptances').select('*').eq('member_id', id),
  ]);
  if (!m) notFound();

  // Live PandaDoc execution status for members who signed via e-sign.
  let esign:
    | { status: string; memberSigned: boolean; fullyExecuted: boolean; signers: { email: string; name: string; role?: string; completed: boolean }[] }
    | null = null;
  if (m.esign_document_id && pandadocConfigured()) {
    try {
      esign = await getEsignSummary(m.esign_document_id, m.email);
    } catch {
      esign = null;
    }
  }

  // Fund record: the member_finances row linked to this login (if any), plus the
  // unlinked register rows the office can match this login to. Staff read every
  // row via the member_finances is_staff() RLS policy.
  const [{ data: linkedFinance }, { data: unlinkedFinance }] = await Promise.all([
    supabase.from('member_finances').select('member_no, full_name, current_balance').eq('member_id', id).maybeSingle(),
    supabase.from('member_finances').select('member_no, full_name, current_balance').is('member_id', null).order('member_no', { ascending: true }),
  ]);

  // Financial activity for this member — money in (contributions) and money out
  // (dividends declared, welfare claims). Staff read every row via RLS.
  const [{ data: contribRows }, { data: dividendRows }, { data: welfareRows }, { data: withdrawalRows }] = await Promise.all([
    supabase.from('contributions').select('*').eq('member_id', id).order('created_at', { ascending: false }).limit(10),
    supabase.from('dividends').select('*').eq('member_id', id).order('declared_at', { ascending: false }).limit(10),
    supabase.from('welfare_claims').select('*').eq('member_id', id).order('filed_at', { ascending: false }).limit(10),
    supabase.from('withdrawals').select('*').eq('member_id', id).order('occurred_at', { ascending: false }).limit(10),
  ]);
  const contributions = (contribRows ?? []) as any[];
  const dividendsList = (dividendRows ?? []) as any[];
  const welfareClaims = (welfareRows ?? []) as any[];
  const withdrawalsList = (withdrawalRows ?? []) as any[];

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
  const accByAgr: Record<string, any> = {};
  ((acceptances ?? []) as any[]).forEach((a) => (accByAgr[a.agreement_id] = a));
  const agreementDocs = (agrDocs ?? []) as any[];

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
          <span className="badge badge-info">{displayRole(m.role, m.title)}</span>
          <span className={`badge ${statusCls}`}>{statusLabel(m.status)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Decision</div>
        {!canApproveMembers(viewerRole) ? (
          <div className="muted" style={{ fontSize: 12.5 }}>Member approvals and status changes are handled by an Admin or the Chairlady.</div>
        ) : (
        <>
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
        </>
        )}
      </div>

      {/* Fund record — map this login to its AWIVEST register position (member_finances). */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Fund record (AWIVEST register)</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          An Admin maps this login to its AWIVEST register position. National ID / Passport and phone are captured at onboarding to help match; only an Admin can link or unlink. On file for this login: <strong>{m.full_name || '—'}</strong> · ID <strong>{m.national_id || '—'}</strong> · Phone <strong>{m.phone || '—'}</strong>
        </div>
        {linkedFinance ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="badge badge-good" style={{ fontSize: 11 }}><i className="fa-solid fa-link" /> Linked to {linkedFinance.member_no}</span>
              <span style={{ fontSize: 13 }}>{linkedFinance.full_name} · Current balance KES {Number(linkedFinance.current_balance || 0).toLocaleString()}</span>
            </div>
            {canMapMembership(viewerRole) && (
            <form action={unlinkFundRecord}>
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="member_no" value={linkedFinance.member_no} />
              <button className="btn btn-ghost btn-sm" type="submit"><i className="fa-solid fa-link-slash" /> Unlink</button>
            </form>
            )}
          </div>
        ) : canMapMembership(viewerRole) && unlinkedFinance && unlinkedFinance.length > 0 ? (
          <form action={linkFundRecord} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input type="hidden" name="id" value={m.id} />
            <div className="field" style={{ flex: 1, minWidth: 260, marginBottom: 0 }}>
              <label>Match to an unlinked register record</label>
              <select className="input" name="member_no" required defaultValue="">
                <option value="" disabled>Select a member…</option>
                {(unlinkedFinance as any[]).map((f) => (
                  <option key={f.member_no} value={f.member_no}>
                    {f.member_no} — {f.full_name} (KES {Number(f.current_balance || 0).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-lime" type="submit"><i className="fa-solid fa-link" /> Link record</button>
          </form>
        ) : (
          <div className="muted" style={{ fontSize: 12.5 }}>{canMapMembership(viewerRole) ? 'Every register record is already linked to a login.' : 'This login is not yet linked to a fund record. Only an Admin can map it.'}</div>
        )}
      </div>

      {/* Record a withdrawal — reduces the fund balance and shows on the statement. */}
      {linkedFinance && canDisburseFunds(viewerRole) && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Record a withdrawal</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
            Records a payout against {linkedFinance.member_no} and reduces the fund balance (net balance and portfolio value). It appears on the member&apos;s statement, replacing the old hand-typed note.
          </div>
          <form action={recordWithdrawal} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', alignItems: 'end' }}>
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="member_no" value={linkedFinance.member_no} />
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Amount (KES)</label>
              <input className="input" name="amount" inputMode="numeric" placeholder="0" required />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Method</label>
              <select className="input" name="method" defaultValue="mpesa">
                <option value="mpesa">M-Pesa</option>
                <option value="bank">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Reference</label>
              <input className="input" name="reference" placeholder="M-Pesa / bank ref" />
            </div>
            <div className="field" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
              <label>Note (optional)</label>
              <input className="input" name="note" placeholder="e.g. partial exit refund" />
            </div>
            <button className="btn btn-primary" type="submit" style={{ gridColumn: '1 / -1', justifySelf: 'start' }}>
              <i className="fa-solid fa-money-bill-transfer" /> Record withdrawal
            </button>
          </form>
        </div>
      )}

      {/* Financial activity — money in (contributions) and out (dividends, welfare). */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Financial activity</div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Contributions, dividends and welfare claims recorded for this member. Withdrawals will appear here once recorded.
        </div>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Contributions</div>
            {contributions.length === 0 ? (
              <div className="muted" style={{ fontSize: 12.5 }}>None recorded.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {contributions.map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                    <span className="muted">{c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : ''} · {c.method}{c.status && c.status !== 'confirmed' ? ` · ${c.status}` : ''}</span>
                    <span style={{ fontWeight: 600 }}>{KES(Number(c.amount || 0))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Dividends</div>
            {dividendsList.length === 0 ? (
              <div className="muted" style={{ fontSize: 12.5 }}>None recorded.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dividendsList.map((d) => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                    <span className="muted">{d.source}{d.period ? ` · ${d.period}` : ''} · {d.status}</span>
                    <span style={{ fontWeight: 600 }}>{KES(Number(d.amount || 0))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Welfare claims</div>
            {welfareClaims.length === 0 ? (
              <div className="muted" style={{ fontSize: 12.5 }}>None filed.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {welfareClaims.map((w) => (
                  <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                    <span className="muted">{w.filed_at ? new Date(w.filed_at).toLocaleDateString('en-GB') : ''} · {w.claim_type} · {w.status}</span>
                    <span style={{ fontWeight: 600 }}>{w.amount ? KES(Number(w.amount)) : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Withdrawals</div>
            {withdrawalsList.length === 0 ? (
              <div className="muted" style={{ fontSize: 12.5 }}>None recorded.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {withdrawalsList.map((w) => (
                  <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                    <span className="muted">{w.occurred_at ? new Date(w.occurred_at).toLocaleDateString('en-GB') : ''}{w.method ? ` · ${w.method}` : ''}{w.reference ? ` · ${w.reference}` : ''}</span>
                    <span style={{ fontWeight: 600, color: 'var(--bad)' }}>− {KES(Number(w.amount || 0))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <RelationsEditor memberId={m.id} relations={relations ?? []} />

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
          <div style={{ marginTop: 16, fontWeight: 700, fontSize: 14 }}>Agreements</div>
          {m.esign_document_id ? (
            <div style={{ marginTop: 8 }}>
              {/* The member's own signature — this is what unlocks their onboarding. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13 }}>Membership agreement (e-signed)</span>
                {m.esign_status === 'completed' ? (
                  <span className="badge badge-good" style={{ fontSize: 11 }} title={m.esign_signed_at ? new Date(m.esign_signed_at).toLocaleString() : undefined}>
                    <i className="fa-solid fa-circle-check" /> Member signed{m.esign_signed_at ? ` · ${new Date(m.esign_signed_at).toLocaleDateString()}` : ''}
                  </span>
                ) : (
                  <span className="badge badge-warn" style={{ fontSize: 11 }}>Awaiting member signature</span>
                )}
              </div>
              {/* Overall execution across all signers (member + officials) — live from PandaDoc. */}
              {esign ? (
                <>
                  <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                    {esign.fullyExecuted
                      ? 'Fully executed — signed by all parties.'
                      : `Awaiting counter-signature — ${esign.signers.filter((s) => s.completed).length} of ${esign.signers.length} signer(s) done.`}
                  </div>
                  {esign.signers.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      {esign.signers.map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12.5 }}>{s.name}{s.role ? ` · ${s.role}` : ''}</span>
                          {s.completed ? (
                            <span className="badge badge-good" style={{ fontSize: 10.5 }}><i className="fa-solid fa-check" /> Signed</span>
                          ) : (
                            <span className="badge badge-warn" style={{ fontSize: 10.5 }}>Pending</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Live counter-signature status is unavailable right now.</div>
              )}
            </div>
          ) : agreementDocs.length === 0 ? (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>No agreements published.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {agreementDocs.map((a) => {
                const acc = accByAgr[a.id];
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13 }}>{a.title}{a.required ? '' : ' (optional)'}</span>
                    {acc ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span className="badge badge-good" style={{ fontSize: 11 }} title={new Date(acc.signed_at).toLocaleString()}>
                          <i className="fa-solid fa-signature" /> {acc.signed_name}
                        </span>
                        <Link href={`/staff/agreements/signed/${acc.id}`} className="btn btn-ghost btn-sm"><i className="fa-solid fa-eye" /> Preview</Link>
                        <a href={`/staff/agreements/signed/${acc.id}/download`} className="btn btn-primary btn-sm"><i className="fa-solid fa-file-pdf" /> Download PDF</a>
                      </span>
                    ) : (
                      <span className="badge badge-warn" style={{ fontSize: 11 }}>Not signed</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Send a one-off agreement</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Email this investor a separate document to e-sign (for example a resolution or addendum).</div>
            <OneOffAgreement memberId={m.id} memberEmail={m.email} configured={pandadocConfigured()} />
          </div>
        </div>
      </div>
    </div>
  );
}
