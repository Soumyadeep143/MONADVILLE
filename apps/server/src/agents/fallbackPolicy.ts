import type { Agent, CandidateAction, SelectedAction } from "@econforge/shared";
import { seededRandom, hashString } from "../simulation/random.js";

/**
 * Deterministic rule-based decision policy — used whenever no LLM is
 * configured, or the LLM call/validation fails (architecture.md §9,
 * flow.md §16 "LLM failure: choose deterministic fallback action").
 * Weighted by personality, with hard survival/debt overrides first.
 */
export function pickFallbackAction(agent: Agent, candidates: CandidateAction[], seed: number, gameDay: number): SelectedAction {
  const byAction = (action: string) => candidates.filter((c) => c.action === action);

  if (agent.state.hunger >= 2) {
    const meal = byAction("BUY_MEAL")[0];
    if (meal) return toSelected(meal, "HUNGER_PRESSURE");
  }
  const urgentRepay = byAction("REPAY_LOAN")[0];
  if (urgentRepay) return toSelected(urgentRepay, "DEBT_DUE_SOON");

  const weighted = candidates.map((c) => ({ candidate: c, weight: weightOf(agent, c) }));
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  const roll = seededRandom(seed, gameDay, hashString(agent.id)) * total;

  let cursor = 0;
  for (const { candidate, weight } of weighted) {
    cursor += weight;
    if (roll <= cursor) return toSelected(candidate, "PERSONALITY_WEIGHTED_FALLBACK");
  }
  return toSelected(candidates[candidates.length - 1], "FALLBACK_DEFAULT");
}

function weightOf(agent: Agent, c: CandidateAction): number {
  const { risk, spending, ethics, confidence, fomo } = agent.personality;
  const norm = (v: number) => Math.max(0.2, v / 50);

  switch (c.action) {
    case "WORK":
      return 3; // strong default: unemployed agents need income
    case "BUY_MEAL":
      return 2;
    case "VISIT_THEATRE":
      return 0.6 * norm(spending) * norm(fomo);
    case "BUY_PROPERTY":
      return 0.4 * norm(risk) * norm(confidence);
    case "SELL_PROPERTY":
      return 0.2;
    case "START_FARM":
    case "START_RESTAURANT":
    case "START_THEATRE":
      return 0.3 * norm(confidence) * norm(risk);
    case "TAKE_LOAN":
      return 0.3 * norm(risk);
    case "REPAY_LOAN":
      return 0.8 * norm(ethics);
    case "BUY_GOOD":
      return 0.6;
    case "SAVE":
      return 0.5 * norm(100 - spending);
    default:
      return 0.2;
  }
}

export function toSelected(c: CandidateAction, reasonCode: string): SelectedAction {
  return { action: c.action, targetId: c.targetId, amount: c.amount, reasonCode };
}
