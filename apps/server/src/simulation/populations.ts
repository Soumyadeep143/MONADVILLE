import type { Personality } from "@econforge/shared";
import { seededRandom } from "./random.js";

const TRAITS: (keyof Personality)[] = ["risk", "spending", "ethics", "confidence", "fomo"];

/**
 * Population generators for prd.md §22 / roadmap.md Phase 9 experiments.
 * All are pure functions of (count, seed) — same seed always produces the
 * same set of personalities, so different decision policies (or rule sets)
 * can be compared against an identical population, isolating the thing
 * actually being varied.
 */

/** Every agent shares the exact same profile. */
export function homogeneousPopulation(count: number, personality: Personality): Personality[] {
  return Array.from({ length: count }, () => ({ ...personality }));
}

/** Each agent gets an independently randomized profile (seeded, reproducible). */
export function heterogeneousPopulation(count: number, seed: number): Personality[] {
  return Array.from({ length: count }, (_, i) => {
    const p = {} as Personality;
    for (const [t, trait] of TRAITS.entries()) {
      p[trait] = Math.round(seededRandom(seed, i, t + 1) * 100);
    }
    return p;
  });
}

/**
 * Heterogeneous population with one trait skewed toward `level` for every
 * agent (e.g. "high-risk population", "high-FOMO population" — roadmap.md
 * Phase 9). Other traits stay independently randomized.
 */
export function skewedPopulation(count: number, seed: number, trait: keyof Personality, level: number): Personality[] {
  return heterogeneousPopulation(count, seed).map((p) => ({ ...p, [trait]: level }));
}
