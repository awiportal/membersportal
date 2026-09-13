'use client';
import Link from 'next/link';
import { useEffect } from 'react';

// Shared print / Save-as-PDF + CSV toolbar for the reports suite (#156). When
// the page is opened with ?print=1 it auto-opens the browser's Save-as-PDF
// dialog once the sheet has painted. The toolbar itself is .no-print.
export default function ReportToolbar({
  title,
  csvHref,
  autoPrint,
}: {
  title: string;
  csvHref: string;
  autoPrint?: boolean;
}) {
  function printReport() {
    const prev = document.title;
    const safe =
      String(title || 'AWIVEST Report').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() ||
      'AWIVEST Report';
    document.title = safe;
    window.addEventListener('afterprint', () => { document.title = prev; }, { once: true });
    window.print();
  }

  useEffect(() => {
    if (autoPrint !== true) return;
    const t = setTimeout(printReport, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint]);

  return (
    <div
      className="no-print"
      style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}
    >
      <Link href="/staff/reports/generate" className="btn btn-ghost btn-sm">
        <i className="fa-solid fa-arrow-left" /> All reports
      </Link>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a className="btn btn-ghost btn-sm" href={csvHref}>
          <i className="fa-solid fa-file-csv" /> Export CSV
        </a>
        <button className="btn btn-primary btn-sm" type="button" onClick={printReport}>
          <i className="fa-solid fa-print" /> Print / Save PDF
        </button>
      </div>
    </div>
  );
}
