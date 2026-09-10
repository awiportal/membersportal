'use client';

import StatementSheet from '@/components/StatementSheet';

// Print / save-to-PDF with the member's own name as the suggested filename.
// The browser derives the download name from document.title, so we swap it to
// "<Name> - AWIVEST Statement <period>" for the duration of the print, then
// restore the app title afterwards. Result: the saved file is e.g.
// "Agnes A Odinga - AWIVEST Statement 31 Jul 2026.pdf", not the app title.
function downloadStatement(fullName?: string, asOf?: string | null) {
  const prev = document.title;
  const safeName = String(fullName || 'Statement').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Statement';
  document.title = safeName + ' - AWIVEST Statement' + (asOf ? ' ' + asOf : '');
  const restore = () => { document.title = prev; };
  window.addEventListener('afterprint', restore, { once: true });
  window.print();
}

export default function MemberStatement({ fin }: { fin: any }) {
  const asOf = fin.as_of
    ? new Date(fin.as_of).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Your statement</div>
          <div className="muted" style={{ fontSize: 12.5 }}>The same official figures the office holds for you. Print or save as PDF.</div>
        </div>
        <button className="btn btn-lime btn-sm" type="button" onClick={() => downloadStatement(fin.full_name, asOf)}>
          <i className="fa-solid fa-download" /> Download PDF
        </button>
      </div>

      <StatementSheet fin={fin} />
    </div>
  );
}
