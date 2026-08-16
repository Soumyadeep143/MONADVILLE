// Pure statistics over a wealth distribution — prd.md §21/§22, api.md §12.

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function top10WealthShare(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  const cutoff = Math.max(1, Math.ceil(sorted.length * 0.1));
  const top = sorted.slice(0, cutoff).reduce((a, b) => a + b, 0);
  const total = sorted.reduce((a, b) => a + b, 0);
  return total === 0 ? 0 : top / total;
}

/**
 * Standard discrete Gini coefficient. Net worth can be negative (debt); the
 * formula assumes non-negative values, so those are clamped to 0 here —
 * documented simplification, matches how the wealth distribution is
 * reported everywhere else in analytics.
 */
export function gini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].map((v) => Math.max(0, v)).sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  const weightedSum = sorted.reduce((acc, x, i) => acc + (i + 1) * x, 0);
  return (2 * weightedSum - (n + 1) * sum) / (n * sum);
}
