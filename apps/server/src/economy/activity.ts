import type { ActivityProfile } from "@econforge/shared";
import { ACTIVITY_DELTA } from "@econforge/shared";

/** Pure state transition — prd.md §8, flow.md §13. Descriptive only, never economic power. */
export function applyActivityDelta(
  act: ActivityProfile,
  delta: number,
  reason: keyof typeof ACTIVITY_DELTA | string,
  day: number,
): ActivityProfile {
  const value = Math.max(0, act.score + delta);
  return {
    score: value,
    history: [...act.history, { day, delta, reason, value, createdAt: new Date().toISOString() }],
  };
}

export { ACTIVITY_DELTA };
