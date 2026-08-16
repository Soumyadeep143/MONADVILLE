import type { Agent, CandidateAction, SelectedAction } from "@econforge/shared";
import { seededRandom, hashString } from "../simulation/random.js";
import { toSelected } from "./fallbackPolicy.js";

/**
 * RANDOM baseline (prd.md §22): uniform pick among currently-valid
 * candidates, personality-blind. Deterministic given (seed, day, userId) so
 * repeated experiment runs — and replays (flow.md §15) — are comparable.
 * Salts on userId, not the DB-assigned agent.id: the latter is a surrogate
 * key that a fresh/replayed run won't reproduce (e.g. a persistent store's
 * auto-incrementing id keeps climbing across runs), which would silently
 * break reproducibility even with the same seed.
 */
export function pickRandomAction(agent: Agent, candidates: CandidateAction[], seed: number, gameDay: number): SelectedAction {
  const roll = seededRandom(seed, gameDay, hashString(agent.userId) + 1); // +1 salt: decorrelate from the personality-fallback's own roll
  const index = Math.min(candidates.length - 1, Math.floor(roll * candidates.length));
  return toSelected(candidates[index], "RANDOM_BASELINE");
}

// RATIONAL baseline (prd.md §22): a fixed, personality-independent utility
// ranking — survival and debt service first, then income-generating and
// wealth-preserving actions over speculative or purely consumptive ones.
// Deterministic (no randomness at all): same state always yields the same
// pick, which is the point of a "rational" reference agent to compare
// personality-driven behavior against.
const UTILITY: Partial<Record<CandidateAction["action"], number>> = {
  BUY_MEAL: 100,
  REPAY_LOAN: 90,
  WORK: 80,
  BUY_GOOD: 50,
  SELL_GOOD: 45,
  START_FARM: 40,
  START_RESTAURANT: 40,
  START_THEATRE: 40,
  SAVE: 30,
  SELL_PROPERTY: 20,
  BUY_PROPERTY: 15,
  TAKE_LOAN: 10,
  VISIT_THEATRE: 5,
};

export function pickRationalAction(_agent: Agent, candidates: CandidateAction[]): SelectedAction {
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const score = UTILITY[c.action] ?? 0;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return toSelected(best, "RATIONAL_UTILITY");
}
