// Candidate action set, mirrors docs/prd.md §17.

export const ACTION_TYPES = [
  "WORK",
  "BUY_MEAL",
  "VISIT_THEATRE",
  "BUY_PROPERTY",
  "SELL_PROPERTY",
  "START_FARM",
  "START_RESTAURANT",
  "START_THEATRE",
  "TAKE_LOAN",
  "REPAY_LOAN",
  "SAVE",
  "BUY_GOOD",
  "SELL_GOOD",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export function isActionType(value: string): value is ActionType {
  return (ACTION_TYPES as readonly string[]).includes(value);
}

/**
 * An action the engine has determined is currently legal for an agent to
 * take. `id` is the handle the LLM selects by — it never invents an
 * action/target/amount combination, only picks one of these by id
 * (decisionEngine.ts resolves the id back to this exact object).
 */
export interface CandidateAction {
  id: string;
  action: ActionType;
  targetId: string | null;
  amount: number | null;
  /** Short human-readable hint shown to the LLM, e.g. "Farmland available at 100 coins". */
  description: string;
}

/** What the decision layer (LLM or fallback) picks — validated again by the engine before execution. */
export interface SelectedAction {
  action: ActionType;
  targetId: string | null;
  amount: number | null;
  reasonCode: string;
}
