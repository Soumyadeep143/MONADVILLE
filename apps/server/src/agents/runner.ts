import type { Agent, CandidateAction, SelectedAction } from "@econforge/shared";
import { PROMPT_VERSION } from "@econforge/shared";
import type { EconomyContext } from "../economy/context.js";
import { ActionError } from "../economy/errors.js";
import * as economy from "../economy/index.js";
import { generateCandidateActions } from "./candidates.js";
import { decideAction } from "./decisionEngine.js";
import { appendMemory } from "./memory.js";

async function execute(ctx: EconomyContext, agent: Agent, action: SelectedAction, simulationId: string, gameDay: number): Promise<string> {
  switch (action.action) {
    case "SAVE":
      return "Saved cash, took no action.";
    case "WORK": {
      if (!action.targetId) throw new ActionError("INVALID_ACTION", "WORK requires a target business");
      await economy.joinBusiness(ctx, agent, action.targetId, simulationId, gameDay);
      return "Took a job.";
    }
    case "BUY_MEAL": {
      if (!action.targetId) throw new ActionError("INVALID_ACTION", "BUY_MEAL requires a target restaurant");
      await economy.buyMeal(ctx, agent, action.targetId, simulationId, gameDay);
      return "Bought a meal.";
    }
    case "VISIT_THEATRE": {
      if (!action.targetId) throw new ActionError("INVALID_ACTION", "VISIT_THEATRE requires a target theatre");
      await economy.visitTheatre(ctx, agent, action.targetId, simulationId, gameDay);
      return "Visited the theatre.";
    }
    case "BUY_PROPERTY": {
      const bought = await economy.buyProperty(ctx, agent, simulationId, gameDay, action.targetId);
      return action.targetId ? `Bought a listed property for ${bought.marketValue}.` : "Bought unclaimed land.";
    }
    case "SELL_PROPERTY": {
      if (!action.targetId) throw new ActionError("INVALID_PROPERTY", "SELL_PROPERTY requires a target property");
      await economy.listPropertyForSale(ctx, agent, action.targetId, simulationId, gameDay);
      return "Listed property for sale.";
    }
    case "START_FARM":
    case "START_RESTAURANT":
    case "START_THEATRE": {
      const type = action.action.replace("START_", "") as "FARM" | "RESTAURANT" | "THEATRE";
      await economy.startBusiness(ctx, agent, type, simulationId, gameDay);
      return `Started a ${type.toLowerCase()}.`;
    }
    case "TAKE_LOAN": {
      if (!action.amount) throw new ActionError("INVALID_LOAN", "TAKE_LOAN requires an amount");
      await economy.takeLoan(ctx, agent, action.amount, simulationId, gameDay);
      return `Took a loan of ${action.amount}.`;
    }
    case "REPAY_LOAN": {
      if (!action.targetId) throw new ActionError("INVALID_LOAN", "REPAY_LOAN requires a target loan");
      await economy.repayLoan(ctx, agent, action.targetId, simulationId, gameDay);
      return "Repaid a loan.";
    }
    case "BUY_GOOD": {
      if (!action.targetId) throw new ActionError("INVALID_BUSINESS", "BUY_GOOD requires a target seller");
      const own = (await ctx.repos.businesses.findBySimulation(simulationId, { ownerId: agent.id })).filter(
        (b) => b.status !== "FAILED" && (b.type === "RESTAURANT" || b.type === "FARM"),
      );
      const buyerBusiness = own.sort((a, b) => a.inventory.food - b.inventory.food)[0];
      if (!buyerBusiness) throw new ActionError("INVALID_BUSINESS", "Agent does not own a business that consumes food");
      await economy.buyFood(ctx, agent, buyerBusiness.id, action.targetId, action.amount ?? 5, simulationId, gameDay);
      return "Bought food supplies.";
    }
    case "SELL_GOOD": {
      if (!action.targetId) throw new ActionError("INVALID_BUSINESS", "SELL_GOOD requires a target buyer");
      const own = (await ctx.repos.businesses.findBySimulation(simulationId, { ownerId: agent.id })).filter((b) => b.status !== "FAILED" && b.inventory.food > 0);
      const sellerBusiness = own.sort((a, b) => b.inventory.food - a.inventory.food)[0];
      if (!sellerBusiness) throw new ActionError("INVALID_BUSINESS", "Agent does not own a business with food to sell");
      await economy.sellFood(ctx, agent, sellerBusiness.id, action.targetId, action.amount ?? 5, simulationId, gameDay);
      return "Sold surplus food.";
    }
    default:
      throw new ActionError("INVALID_ACTION", `Unsupported action: ${action.action}`);
  }
}

export interface PreparedDecision {
  agentId: string;
  candidates: CandidateAction[];
  selected: SelectedAction;
  source: "LLM" | "FALLBACK";
  model: string | null;
}

/**
 * Read-only half of a decision cycle: recalculate state -> generate the
 * deterministic candidate list -> personality-weighted LLM/fallback pick.
 * No state mutation happens here, which is exactly what makes it safe to
 * run for many agents concurrently (see DayProcessor.ts) — the LLM round
 * trip, not local computation, is what dominates a cycle's wall-clock time,
 * so fanning these out is the actual throughput win.
 */
export async function prepareAgentDecision(
  ctx: EconomyContext,
  agent: Agent,
  simulationId: string,
  gameDay: number,
  seed: number,
  marketSummary: string,
): Promise<PreparedDecision> {
  const candidates = await generateCandidateActions(ctx, agent, simulationId, gameDay);
  const { selected, source, model } = await decideAction(agent, candidates, marketSummary, seed, gameDay);
  return { agentId: agent.id, candidates, selected, source, model };
}

/**
 * Mutating half of a decision cycle: validate -> execute -> persist decision
 * record + memory. Callers must run these sequentially (never concurrently
 * for the same agent, and never interleaved with another agent's execution
 * on the same shared resources) — the in-memory/Mongo store isn't
 * transactional across documents. Re-fetches the agent fresh immediately
 * before executing: since prepare() for a whole cycle's batch runs before
 * any of that batch's executions, a candidate chosen earlier in the batch
 * can go stale by the time its turn to execute comes up (e.g. a targeted
 * farm's food sold out to an earlier agent this same cycle) — execute()
 * re-validates for real and simply records the action as rejected if so,
 * per prd.md §23 ("invalid actions cannot modify state"); the simulation
 * continues either way.
 */
export async function applyAgentDecision(ctx: EconomyContext, prepared: PreparedDecision, simulationId: string, gameDay: number): Promise<void> {
  const { agentId, candidates, selected, source, model } = prepared;
  const fresh = await ctx.repos.agents.findById(agentId);
  if (!fresh) return;

  let summary: string;
  try {
    summary = await execute(ctx, fresh, selected, simulationId, gameDay);
  } catch (err) {
    const reason = err instanceof ActionError ? `${err.code}: ${err.message}` : "Unknown execution error";
    summary = `Attempted ${selected.action} but it was rejected (${reason}).`;
  }

  await ctx.repos.decisions.create({
    simulationId,
    agentId,
    gameDay,
    availableActions: candidates.map((c) => c.action),
    selectedAction: selected,
    source,
    model,
    promptVersion: PROMPT_VERSION,
  });

  const afterExecution = await ctx.repos.agents.findById(agentId);
  if (afterExecution) {
    await ctx.repos.agents.update(agentId, { memory: appendMemory(afterExecution, gameDay, summary) });
  }
}

/** Convenience wrapper for callers that just want one full cycle for one agent, sequentially. */
export async function runAgentDecision(ctx: EconomyContext, agent: Agent, simulationId: string, gameDay: number, seed: number, marketSummary: string): Promise<void> {
  const prepared = await prepareAgentDecision(ctx, agent, simulationId, gameDay, seed, marketSummary);
  await applyAgentDecision(ctx, prepared, simulationId, gameDay);
}
