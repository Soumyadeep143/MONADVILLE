import type { Agent, SelectedAction } from "@econforge/shared";
import type { EconomyContext } from "../economy/context.js";
import { ActionError } from "../economy/errors.js";
import * as economy from "../economy/index.js";
import { generateCandidateActions } from "./candidates.js";
import { decideAction } from "./decisionEngine.js";
import { appendMemory } from "./memory.js";
import { PROMPT_VERSION } from "@econforge/shared";

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
      await economy.buyProperty(ctx, agent, simulationId, gameDay);
      return "Bought land.";
    }
    case "SELL_PROPERTY": {
      if (!action.targetId) throw new ActionError("INVALID_PROPERTY", "SELL_PROPERTY requires a target property");
      await economy.sellProperty(ctx, agent, action.targetId, simulationId, gameDay);
      return "Sold property.";
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

/**
 * One full decide -> execute -> complete cycle for one agent: recalculate
 * state -> generate the deterministic candidate list -> personality-weighted
 * LLM/fallback pick -> validate -> execute -> persist decision record +
 * memory. The caller (DayProcessor) runs several of these per agent per
 * simulated day, each one fully resolving before the agent's next cycle
 * starts — an agent never has two decisions in flight. Invalid actions never
 * mutate state; they're recorded as rejected instead.
 */
export async function runAgentDecision(
  ctx: EconomyContext,
  agent: Agent,
  simulationId: string,
  gameDay: number,
  seed: number,
  marketSummary: string,
): Promise<void> {
  const candidates = await generateCandidateActions(ctx, agent, simulationId, gameDay);
  const { selected, source, model } = await decideAction(agent, candidates, marketSummary, seed, gameDay);

  let summary: string;
  try {
    summary = await execute(ctx, agent, selected, simulationId, gameDay);
  } catch (err) {
    const reason = err instanceof ActionError ? `${err.code}: ${err.message}` : "Unknown execution error";
    summary = `Attempted ${selected.action} but it was rejected (${reason}).`;
  }

  await ctx.repos.decisions.create({
    simulationId,
    agentId: agent.id,
    gameDay,
    availableActions: candidates.map((c) => c.action),
    selectedAction: selected,
    source,
    model,
    promptVersion: PROMPT_VERSION,
  });

  const fresh = await ctx.repos.agents.findById(agent.id);
  if (fresh) {
    await ctx.repos.agents.update(agent.id, { memory: appendMemory(fresh, gameDay, summary) });
  }
}
