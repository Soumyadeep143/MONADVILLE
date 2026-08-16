import Anthropic from "@anthropic-ai/sdk";
import { llmDecisionSchema, PROMPT_VERSION } from "@econforge/shared";
import type { Agent, CandidateAction, SelectedAction } from "@econforge/shared";
import { env } from "../config/env.js";
import { pickFallbackAction } from "./fallbackPolicy.js";
import { summarizeMemory } from "./memory.js";

// Structured LLM decision output. The model selects an option id from the
// list the deterministic engine already generated — it cannot invent an
// action, a target, or an amount. This JSON schema is the first gate (via
// output_config.format); llmDecisionSchema (zod) is the second; matching the
// returned id against the actual candidate list (below) is the third and
// final one — nothing reaches the economy engine that wasn't already an
// engine-generated, currently-valid option.
const DECISION_JSON_SCHEMA = {
  type: "object",
  properties: {
    selectedOptionId: { type: "string" },
    reasonCode: { type: "string" },
  },
  required: ["selectedOptionId", "reasonCode"],
  additionalProperties: false,
} as const;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

function buildPrompt(agent: Agent, candidates: CandidateAction[], marketSummary: string, day: number): string {
  return [
    `Simulation tick ${day}. You are agent ${agent.id}.`,
    ``,
    `Behavioral tendencies (0-100, higher = stronger tendency):`,
    `risk=${agent.personality.risk} spending=${agent.personality.spending} ethics=${agent.personality.ethics} confidence=${agent.personality.confidence} fomo=${agent.personality.fomo}`,
    ``,
    `Your state: cash=${agent.economic.cash} debt=${agent.economic.outstandingDebt} hunger=${agent.state.hunger} employment=${agent.state.employmentStatus}`,
    ``,
    `Market: ${marketSummary}`,
    ``,
    `Recent memory:`,
    summarizeMemory(agent.memory),
    ``,
    `Here are the only actions currently valid for you. Pick exactly one by its id — you cannot choose anything not listed here:`,
    ...candidates.map((c) => `- id=${c.id}: ${c.description} (action=${c.action})`),
    ``,
    `Respond with the id of the option you choose and a short reasonCode (uppercase snake-case) summarizing why.`,
  ].join("\n");
}

/**
 * Resolves one decision cycle for an agent: the deterministic engine has
 * already computed the finite, currently-valid candidate list; this picks
 * exactly one of them (LLM when configured, deterministic fallback
 * otherwise) and never anything outside it. Falls back to the deterministic
 * policy with no API key, on any LLM/parse/validation failure, or when the
 * model returns an id that isn't in the candidate list — the caller
 * (agents/runner.ts) then executes and, only once that's fully resolved,
 * moves the agent on to its next cycle.
 */
export async function decideAction(
  agent: Agent,
  candidates: CandidateAction[],
  marketSummary: string,
  seed: number,
  gameDay: number,
): Promise<{ selected: SelectedAction; source: "LLM" | "FALLBACK"; model: string | null }> {
  const anthropic = getClient();
  if (!anthropic || candidates.length === 0) {
    return { selected: pickFallbackAction(agent, candidates, seed, gameDay), source: "FALLBACK", model: null };
  }

  try {
    const response = await anthropic.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 200,
      output_config: { format: { type: "json_schema", schema: DECISION_JSON_SCHEMA } },
      messages: [{ role: "user", content: buildPrompt(agent, candidates, marketSummary, gameDay) }],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) throw new Error("No text content in LLM response");

    const parsed = llmDecisionSchema.parse(JSON.parse(textBlock.text));
    const chosen = candidates.find((c) => c.id === parsed.selectedOptionId);
    if (!chosen) throw new Error(`LLM selected an option id not in the candidate list: ${parsed.selectedOptionId}`);

    return {
      selected: { action: chosen.action, targetId: chosen.targetId, amount: chosen.amount, reasonCode: parsed.reasonCode },
      source: "LLM",
      model: env.CLAUDE_MODEL,
    };
  } catch {
    return { selected: pickFallbackAction(agent, candidates, seed, gameDay), source: "FALLBACK", model: null };
  }
}

export { PROMPT_VERSION };
