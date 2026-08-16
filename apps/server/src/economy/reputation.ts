import type { ReputationProfile } from "@econforge/shared";
import { REPUTATION_DELTA } from "@econforge/shared";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Pure state transition — prd.md §8, flow.md §12. Never gates economic access (enforced by callers simply never checking it). */
export function applyReputationDelta(
  rep: ReputationProfile,
  delta: number,
  reason: keyof typeof REPUTATION_DELTA | string,
  day: number,
): ReputationProfile {
  const value = clamp(rep.score + delta, 0, 100);
  return {
    score: value,
    history: [...rep.history, { day, delta, reason, value, createdAt: new Date().toISOString() }],
  };
}

export { REPUTATION_DELTA };
