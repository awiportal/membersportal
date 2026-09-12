// Money formatter. Renders EXACT cents (2 dp) so figures match the compiled
// statement to the shilling-and-cent (e.g. 6,208,245.71, not 6,208,246).
export const KES = (n: number) =>
  'KES ' +
  (Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Compact variant for big headline KPI cards only (approximate, in millions).
// Falls back to the exact KES() formatter below KES 1M.
export const KESc = (n: number) =>
  (n || 0) >= 1_000_000 ? 'KES ' + ((n || 0) / 1_000_000).toFixed(2) + 'M' : KES(n);

export const pct = (a: number, b: number) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);
