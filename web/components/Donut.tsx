// Dependency-free SVG donut (renders on the server).
export type Segment = { label: string; value: number; color: string };

export default function Donut({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = 54;
  const C = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: 150, height: 150, flex: 'none' }}>
        <svg width="150" height="150" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="75" cy="75" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="16" />
          {segments.map((s, i) => {
            const len = (s.value / total) * C;
            const el = (
              <circle
                key={i}
                cx="75"
                cy="75"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="16"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 140 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span className="dot" style={{ background: s.color }} />
            <span style={{ flex: 1 }}>{s.label}</span>
            <span className="muted num">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
