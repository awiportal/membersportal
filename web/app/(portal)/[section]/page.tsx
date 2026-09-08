import Link from 'next/link';
import { LABELS } from '@/lib/nav';

// Catch-all for any /(portal) path with no dedicated page. Every real portal
// section now has its own route (and those win over this dynamic segment), so
// this only fires on an unknown or mistyped path — a friendly in-shell
// "not found", replacing the earlier "coming soon" placeholder.
export default function SectionPage({ params }: { params: { section: string } }) {
  const label = LABELS[params.section];
  return (
    <div>
      <div className="page-title">{label || 'Page not found'}</div>
      <div className="sub">
        {label
          ? 'That link is not available. Use the menu to open this section, or head back to your dashboard.'
          : 'We could not find that page in your portal.'}
      </div>
      <div className="card card-pad" style={{ marginTop: 24, textAlign: 'center', padding: '56px 24px' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            margin: '0 auto 16px',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--surface2)',
          }}
        >
          <i className="fa-solid fa-compass" style={{ fontSize: 24, color: 'var(--lime2)' }} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Nothing here</div>
        <p className="muted" style={{ fontSize: 13, maxWidth: 440, margin: '8px auto 0', lineHeight: 1.55 }}>
          The page you were looking for is not available. Pick a section from the menu, or head back to your dashboard.
        </p>
        <Link href="/dashboard" className="btn btn-lime" style={{ marginTop: 18 }}>
          <i className="fa-solid fa-arrow-left-long" /> Back to dashboard
        </Link>
      </div>
    </div>
  );
}
