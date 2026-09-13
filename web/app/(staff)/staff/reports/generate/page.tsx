import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser, getSessionProfile } from '@/lib/session';
import { canViewStaffConsole } from '@/lib/roles';
import { REPORTS } from '@/lib/reportDefs';

export const dynamic = 'force-dynamic';

// Formal reports hub (#156): the six on-demand generators. Each opens a
// print-ready page (Save as PDF from the browser) and offers a CSV export.
export default async function ReportsHubPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const me = await getSessionProfile();
  if (!canViewStaffConsole(me?.role)) redirect('/staff');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Formal reports</div>
          <div className="sub">
            On-demand reports generated live from the register. Open one to view, then Save as PDF, or export CSV.
          </div>
        </div>
        <Link href="/staff/reports" className="btn btn-ghost btn-sm">
          <i className="fa-solid fa-arrow-left" /> Fund dashboard
        </Link>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', marginTop: 20 }}>
        {REPORTS.map((r) => (
          <div key={r.slug} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="ic" style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--surface2)', color: 'var(--lime2)' }}>
                <i className={`fa-solid ${r.icon}`} />
              </span>
              <div style={{ fontWeight: 700 }}>{r.label}</div>
            </div>
            <div className="muted" style={{ fontSize: 12.5, flex: 1 }}>{r.desc}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link href={`/staff/reports/generate/${r.slug}`} className="btn btn-primary btn-sm">
                <i className="fa-solid fa-eye" /> Open
              </Link>
              <a href={`/staff/reports/generate/${r.slug}?print=1`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                <i className="fa-solid fa-file-pdf" /> PDF
              </a>
              <a href={`/staff/reports/generate/${r.slug}/csv`} className="btn btn-ghost btn-sm">
                <i className="fa-solid fa-file-csv" /> CSV
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
