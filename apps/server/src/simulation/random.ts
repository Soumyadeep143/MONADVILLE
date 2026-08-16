/**
 * Deterministic, stateless [0,1) generator keyed by (seed, day, salt).
 * Stateless-by-design (no sequential RNG cursor to persist/replay) so any
 * given day's random outcomes can be recomputed independently from just the
 * simulation's seed and day number — required for the replay flow in
 * flow.md §15.
 */
export function seededRandom(seed: number, day: number, salt = 0): number {
  const x = Math.sin(seed * 9301 + day * 49297 + salt * 233) * 233280;
  return x - Math.floor(x);
}

/** Stable small-int hash of an id string, for deriving a per-agent RNG salt. */
export function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
