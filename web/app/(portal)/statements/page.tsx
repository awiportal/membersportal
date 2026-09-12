import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { KES, KESc, interestTotal } from '@/lib/format';
import MemberStatement from './MemberStatement';
import MoneyNav from '@/components/MoneyNav';

export const dynamic = 'force-dynamic';

const n = (v: any) => Number(v || 0);


export default async function StatementsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return null;

  const [{ data: finRows }, { data: docRows }] = await Promise.all([
    supabase.from('member_finances').select('*').eq('member_id', uid).limit(1),
    supabase
      .from('documents')
      .select('*')
      .in('type', ['statement', 'welfare_statement'])
      .order('created_at', { ascending: false }),
  ]);
  const fin = ((finRows ?? []) as any[])[0];
  const docs = (docRows ?? []) as any[];

  const withUrls = await Promise.all(
    docs.map(async (d) => {
      const { data } = await supabase.storage.from('documents').createSignedUrl(d.file_path, 120);
      return { ...d, url: data?.signedUrl as string | undefined };
    })
  );

  const current = fin ? n(fin.current_balance) : 0;
  const interest = fin ? interestTotal(fin) : 0;
  const lifetime = fin ? n(fin.lifetime_contributions) || n(fin.opening_balance_2025) + n(fin.contributions_2026) : 0;
  const asOf = fin?.as_of
    ? new Date(fin.as_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div>
      <MoneyNav />

      {fin ? (
        <section className="hero rise">
          <div className="hero-grid">
            <div>
              <div className="hero-eyebrow">Official Statement{fin.member_no ? ' \u00b7 ' + fin.member_no : ''}</div>
              <div className="hero-value">
                <span className="cur">KES</span>
                {(Number(current) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="hero-line">
                Your official AWIVEST fund statement{asOf ? ', as at ' + asOf : ''}. Print it or save it as a PDF straight from the statement sheet below.
              </div>
              <div className="hero-pills">
                <div className="hero-pill"><div className="k">Contributions</div><div className="v num">{KESc(lifetime)}</div></div>
                <div className="hero-pill"><div className="k">Interest</div><div className="v num">{KESc(interest)}</div></div>
                <div className="hero-pill"><div className="k">Balance</div><div className="v num">{KESc(current)}</div></div>
              </div>
            </div>
            <div className="hero-spark">
              <div className="hero-spark-lbl">Explore your account</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <Link href="/portfolio" className="hero-cta" style={{ justifyContent: 'center' }}><i className="fa-solid fa-chart-pie" /> Portfolio</Link>
                <Link href="/contributions" className="hero-cta" style={{ justifyContent: 'center' }}><i className="fa-solid fa-hand-holding-dollar" /> Contributions</Link>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="page-title">Statements</div>
          <div className="sub">Your official AWIVEST statement, plus any reports the office publishes to you.</div>
        </>
      )}

      {fin ? (
        <div className="rise-2" style={{ marginTop: 16 }}>
          <MemberStatement fin={fin} />
        </div>
      ) : (
        <div className="card card-pad" style={{ marginTop: 20 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Your account statement appears here once your login is linked to your AWIVEST register record. Ask the office to link your member number.
          </div>
        </div>
      )}

      <div className="section-head rise-3" style={{ marginTop: 26 }}>
        <div>
          <div className="section-title">Published documents</div>
          <div className="section-sub">Statements and reports shared with you. Files open via short-lived, signed links &mdash; never public.</div>
        </div>
      </div>
      <div className="card card-pad rise-3" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {withUrls.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No documents have been published to you yet.</div>
        ) : (
          withUrls.map((x) => (
            <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <span className="ic" style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'var(--surface)', color: 'var(--lime2)' }}>
                <i className="fa-solid fa-file-invoice-dollar" />
              </span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 600 }}>{x.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>Published {x.created_at ? new Date(x.created_at).toLocaleDateString('en-GB') : ''}</div>
              </div>
              {x.url ? (
                <a href={x.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                  <i className="fa-solid fa-download" /> Download
                </a>
              ) : (
                <span className="muted" style={{ fontSize: 12 }}>Unavailable</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
