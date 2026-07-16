export const KES = (n: number) => 'KES ' + Math.round(n || 0).toLocaleString('en-KE');
export const KESc = (n: number) =>
  (n || 0) >= 1_000_000 ? 'KES ' + ((n || 0) / 1_000_000).toFixed(2) + 'M' : KES(n);
export const pct = (a: number, b: number) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
