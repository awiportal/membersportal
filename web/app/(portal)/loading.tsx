// Route-level loading UI for the member portal. Renders instantly inside the
// Shell (sidebar + topbar stay put) while a page's server data loads, so moving
// between sections feels immediate instead of showing a blank content area.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card card-pad" style={{ display: 'grid', gap: 10 }}>
            <span className="awi-sk" style={{ width: '55%', height: 12, borderRadius: 6 }} />
            <span className="awi-sk" style={{ width: '80%', height: 26, borderRadius: 8 }} />
            <span className="awi-sk" style={{ width: '40%', height: 10, borderRadius: 6 }} />
          </div>
        ))}
      </div>
      <div className="card card-pad" style={{ display: 'grid', gap: 12 }}>
        <span className="awi-sk" style={{ width: 180, height: 16, borderRadius: 8 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="awi-sk" style={{ width: '100%', height: 14, borderRadius: 6 }} />
        ))}
      </div>
      <style>{`
        .awi-sk {
          display: block;
          background: linear-gradient(90deg, rgba(148,163,184,.14) 25%, rgba(148,163,184,.30) 37%, rgba(148,163,184,.14) 63%);
          background-size: 400% 100%;
          animation: awi-sk-shimmer 1.4s ease infinite;
        }
        @keyframes awi-sk-shimmer { 0% { background-position: 100% 0 } 100% { background-position: 0 0 } }
        @media (prefers-reduced-motion: reduce) { .awi-sk { animation: none } }
      `}</style>
    </div>
  );
}
