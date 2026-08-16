import Groq from "groq-sdk";
import { llmDecisionSchema, PROMPT_VERSION } from "@econforge/shared";
import type { Agent, CandidateAction, SelectedAction } from "@econforge/shared";
import { env } from "../config/env.js";
import { pickFallbackAction } from "./fallbackPolicy.js";
import { summarizeMemory } from "./memory.js";

// Structured LLM decision output. The model selects an option id from the
// list the deterministic engine already generated — it cannot invent an
// action, a target, or an amount. Groq's JSON mode (response_format:
// json_object) only guarantees syntactically-valid JSON, not a specific
// shape, so the prompt spells out the exact two-key object expected;
// llmDecisionSchema (zod) is the second gate, and matching the returned id
// against the actual candidate list (below) is the third and final one —
// nothing reaches the economy engine that wasn't already an
// engine-generated, currently-valid option.
const SYSTEM_PROMPT =
  'You choose exactly one action for a simulated economic agent from a fixed list of options. ' +
  'Respond with ONLY a JSON object of the form {"selectedOptionId": "<id from the list>", "reasonCode": "<SHORT_UPPER_SNAKE_CASE>"} — no other text, no markdown fences.';

let client: Groq | null = null;
function getClient(): Groq | null {
  if (!env.GROQ_API_KEY) return null;
  if (!client) client = new Groq({ apiKey: env.GROQ_API_KEY });
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
  ].join("\n");
}

/**
 * Resolves one decision cycle for an agent: the deterministic engine has
 * already computed the finite, currently-valid candidate list; this picks
 * exactly one of them (Groq when configured, deterministic fallback
 * otherwise) and never anything outside it. Falls back to the deterministic
 * policy with no API key, on any LLM/parse/validation failure, or when the
 * model returns an id that isn't in the candidate list. Pure and
 * side-effect-free (no state mutation) so callers can run many of these
 * concurrently across agents — see agents/runner.ts.
 */
export async function decideAction(
  agent: Agent,
  candidates: CandidateAction[],
  marketSummary: string,
  seed: number,
  gameDay: number,
): Promise<{ selected: SelectedAction; source: "LLM" | "FALLBACK"; model: string | null }> {
  const groq = getClient();
  if (!groq || candidates.length === 0) {
    return { selected: pickFallbackAction(agent, candidates, seed, gameDay), source: "FALLBACK", model: null };
  }

  try {
    const response = await groq.chat.completions.create({
      model: env.GROQ_MODEL,
      max_tokens: 150,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(agent, candidates, marketSummary, gameDay) },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("No content in Groq response");

    const parsed = llmDecisionSchema.parse(JSON.parse(text));
    const chosen = candidates.find((c) => c.id === parsed.selectedOptionId);
    if (!chosen) throw new Error(`LLM selected an option id not in the candidate list: ${parsed.selectedOptionId}`);

    return {
      selected: { action: chosen.action, targetId: chosen.targetId, amount: chosen.amount, reasonCode: parsed.reasonCode },
      source: "LLM",
      model: env.GROQ_MODEL,
    };
  } catch {
    return { selected: pickFallbackAction(agent, candidates, seed, gameDay), source: "FALLBACK", model: null };
  }
}

export { PROMPT_VERSION };
