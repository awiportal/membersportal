import { LABELS } from '@/lib/nav';

export default function SectionPage({ params }: { params: { section: string } }) {
  const label = LABELS[params.section] ?? 'Section';
  return (
    <div>
      <div className="page-title">{label}</div>
      <div className="sub">Part of the AWIVEST portal — being wired up next.</div>
      <div className="card card-pad" style={{ marginTop: 24, textAlign: 'center', padding: '56px 24px' }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, margin: '0 auto 16px', display: 'grid', placeItems: 'center', background: 'var(--surface2)' }}>
          <i className="fa-solid fa-screwdriver-wrench" style={{ fontSize: 24, color: 'var(--lime2)' }} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{label} is coming soon</div>
        <p className="muted" style={{ fontSize: 13, maxWidth: 440, margin: '8px auto 0', lineHeight: 1.55 }}>
          The database, secure storage and design system are already live. This screen will be connected to your real data in an upcoming phase.
        </p>
      </div>
    </div>
  );
}
