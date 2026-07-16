// Dependency-free SVG area chart (renders on the server).
export default function AreaChart({
  data,
  height = 240,
}: {
  data: number[];
  height?: number;
}) {
  const W = 640;
  const H = 240;
  const pad = 8;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = (W - pad * 2) / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (H - pad * 2) * (1 - (v - min) / span);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${H - pad} L ${pts[0][0].toFixed(1)} ${H - pad} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a6cd35" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#a6cd35" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#areaFill)" />
      <path d={line} fill="none" stroke="#a6cd35" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
