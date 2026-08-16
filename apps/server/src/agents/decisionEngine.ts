import Groq from "groq-sdk";
import { llmDecisionSchema, PROMPT_VERSION } from "@econforge/shared";
import type { Agent, CandidateAction, DecisionPolicy, DecisionSource, SelectedAction } from "@econforge/shared";
import { env } from "../config/env.js";
import { pickFallbackAction } from "./fallbackPolicy.js";
import { pickRandomAction, pickRationalAction } from "./policies.js";
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
  if (!client) {
    // maxRetries lets the SDK's built-in backoff ride out a momentary
    // tokens-per-minute bucket contention (common on Groq's free tier when
    // several agents' decisions land in the same instant); the 8s timeout
    // still bounds the worst case so a stuck request can't stall a whole
    // decision cycle — it just falls back for that one agent instead.
    client = new Groq({ apiKey: env.GROQ_API_KEY, timeout: 8_000, maxRetries: 3 });
  }
  return client;
}

// Kept deliberately terse — every token here counts against the account's
// tokens-per-minute budget, and the free tier's default limit (6000 TPM on
// llama-3.1-8b-instant) is tight enough that prompt size directly caps how
// many agents can get a real LLM decision per minute before falling back.
function buildPrompt(agent: Agent, candidates: CandidateAction[], marketSummary: string, day: number): string {
  return [
    `Tick ${day}. Agent ${agent.id}.`,
    `Traits: risk=${agent.personality.risk} spending=${agent.personality.spending} ethics=${agent.personality.ethics} confidence=${agent.personality.confidence} fomo=${agent.personality.fomo}`,
    `State: cash=${agent.economic.cash} debt=${agent.economic.outstandingDebt} hunger=${agent.state.hunger} employment=${agent.state.employmentStatus}`,
    `Market: ${marketSummary}`,
    `Memory: ${summarizeMemory(agent.memory)}`,
    `Valid options (pick exactly one id, nothing else is valid):`,
    ...candidates.map((c) => `- ${c.id}: ${c.description}`),
  ].join("\n");
}

async function decideWithGroq(agent: Agent, candidates: CandidateAction[], marketSummary: string, gameDay: number): Promise<SelectedAction> {
  const groq = getClient();
  if (!groq) throw new Error("Groq not configured");

  const response = await groq.chat.completions.create({
    model: env.GROQ_MODEL,
    max_tokens: 60,
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

  return { action: chosen.action, targetId: chosen.targetId, amount: chosen.amount, reasonCode: parsed.reasonCode };
}

/**
 * Resolves one decision cycle for an agent under the simulation's configured
 * policy (prd.md §22 experiment baselines):
 *
 * - LLM: ask Groq; on any failure (no key, timeout, bad JSON, an id outside
 *   the candidate list) falls back to the deterministic personality policy.
 * - PERSONALITY: the same deterministic policy, but chosen deliberately —
 *   never calls the LLM. Fully reproducible given (seed, day), unlike LLM.
 * - RANDOM / RATIONAL: personality-blind baselines, also fully deterministic.
 *
 * Whichever policy runs, the result is one of the engine-generated
 * candidates — nothing reaches the economy engine that wasn't already
 * validated as currently legal. Pure and side-effect-free (no state
 * mutation) so callers can run many of these concurrently across agents —
 * see agents/runner.ts.
 */
export async function decideAction(
  agent: Agent,
  candidates: CandidateAction[],
  marketSummary: string,
  seed: number,
  gameDay: number,
  policy: DecisionPolicy = "LLM",
): Promise<{ selected: SelectedAction; source: DecisionSource; model: string | null }> {
  if (candidates.length === 0) {
    return { selected: pickFallbackAction(agent, candidates, seed, gameDay), source: "PERSONALITY", model: null };
  }

  if (policy === "RANDOM") {
    return { selected: pickRandomAction(agent, candidates, seed, gameDay), source: "RANDOM", model: null };
  }
  if (policy === "RATIONAL") {
    return { selected: pickRationalAction(agent, candidates), source: "RATIONAL", model: null };
  }
  if (policy === "PERSONALITY") {
    return { selected: pickFallbackAction(agent, candidates, seed, gameDay), source: "PERSONALITY", model: null };
  }

  // policy === "LLM"
  try {
    const selected = await decideWithGroq(agent, candidates, marketSummary, gameDay);
    return { selected, source: "LLM", model: env.GROQ_MODEL };
  } catch {
    return { selected: pickFallbackAction(agent, candidates, seed, gameDay), source: "PERSONALITY", model: null };
  }
}

export { PROMPT_VERSION };
