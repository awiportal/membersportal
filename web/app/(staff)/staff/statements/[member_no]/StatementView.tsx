'use client';
import Link from 'next/link';
import StatementBody from '../StatementBody';

// Print / save-to-PDF named after the member whose statement this is (the
// browser uses document.title as the suggested filename), then restore.
function printStatement(fullName?: string, asOf?: string | null) {
  const prev = document.title;
  const safeName = String(fullName || 'Statement').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Statement';
  document.title = safeName + ' - AWIVEST Statement' + (asOf ? ' ' + asOf : '');
  window.addEventListener('afterprint', () => { document.title = prev; }, { once: true });
  window.print();
}

export default function StatementView({ fin }: { fin: any }) {
  const asOf = fin.as_of
    ? new Date(fin.as_of).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
        <Link href="/staff/statements" className="btn btn-ghost btn-sm"><i className="fa-solid fa-arrow-left" /> All statements</Link>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => printStatement(fin.full_name, asOf)}><i className="fa-solid fa-print" /> Print / Save PDF</button>
      </div>
      <StatementBody fin={fin} />
    </div>
  );
}
