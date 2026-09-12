'use client';

// Downloads for the fund report. "Export Excel" streams the full multi-tab
// workbook (Member Register, Member Statements, Summary, Compiled 2018-Jul 2026,
// 2026 Contribution Schedule) from the server route — matching the AWIVEST
// spreadsheet. "Export CSV" is a quick client-side single-table fallback.
type Row = {
  member_no: string;
  full_name: string;
  status: string;
  opening: number;
  contributions: number;
  interest: number;
  current: number;
};

export default function ReportExport({ rows }: { rows: Row[] }) {
  function downloadCsv() {
    const header = ['Register No', 'Name', 'Status', 'Opening 2025', 'Contributions 2026', 'Interest 2026', 'Current Balance'];
    const esc = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([r.member_no, r.full_name, r.status, r.opening, r.contributions, r.interest, r.current].map(esc).join(','));
    }
    const csv = lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `awivest-fund-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <a className="btn btn-primary btn-sm" href="/staff/reports/export" target="_blank" rel="noopener noreferrer">
        <i className="fa-solid fa-file-excel" /> Export Excel
      </a>
      <button className="btn btn-ghost btn-sm" onClick={downloadCsv} type="button">
        <i className="fa-solid fa-file-csv" /> Export CSV
      </button>
    </div>
  );
}
