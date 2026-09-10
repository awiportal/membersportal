'use client';
import Link from 'next/link';
import StatementBody from '../StatementBody';

export default function StatementView({ fin }: { fin: any }) {
  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
        <Link href="/staff/statements" className="btn btn-ghost btn-sm"><i className="fa-solid fa-arrow-left" /> All statements</Link>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => window.print()}><i className="fa-solid fa-print" /> Print</button>
      </div>
      <StatementBody fin={fin} />
    </div>
  );
}
