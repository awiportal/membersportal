'use client';

// Client-side CSV export of the fund report. Builds the file in the browser and
// triggers a download — no server round-trip, no PII identifiers (names + the
// financial columns only; National ID / phone never leave the Fund records tool).
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
  function download() {
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
    <button className="btn btn-ghost btn-sm" onClick={download} type="button">
      <i className="fa-solid fa-file-csv" /> Export CSV
    </button>
  );
}
