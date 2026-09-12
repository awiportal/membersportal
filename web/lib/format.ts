// Money formatter. Renders EXACT cents (2 dp) so figures match the compiled
// statement to the shilling-and-cent (e.g. 6,208,245.71, not 6,208,246).
export const KES = (n: number) =>
  'KES ' +
  (Number(n) || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Cents are authoritative for AWIVEST: KESc no longer compacts to millions
// (which dropped cents). It now renders EXACT cents, identical to KES().
export const KESc = (n: number) => KES(n);

export const pct = (a: number, b: number) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0);

// Total interest derived from the EXACT per-source cent columns. The stored
// total_interest_2026 aggregate is now cent-exact too, but deriving here keeps
// the figure authoritative even if that column is ever re-imported rounded.
export const interestTotal = (fin: any): number =>
  Math.round(
    ((Number(fin?.interest_2018_2023) || 0) +
      (Number(fin?.britam_interest_life) || 0) +
      (Number(fin?.jubilee_mmf) || 0) +
      (Number(fin?.jubilee_fif) || 0) +
      (Number(fin?.jubilee_fif_apr_jul) || 0)) * 100,
  ) / 100;
