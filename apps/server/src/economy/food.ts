import type { Agent } from "@econforge/shared";
import { ACTIVITY_DELTA } from "@econforge/shared";
import type { EconomyContext } from "./context.js";
import { ActionError } from "./errors.js";
import { syncAgentCash } from "./sync.js";
import { recordTransaction, recordEvent } from "./record.js";
import { applyActivityDelta } from "./activity.js";

/** Deterministic per-day step (flow.md §4): everyone gets hungrier; BUY_MEAL resets it. No health model — prd.md §11. */
export async function applyHungerTick(ctx: EconomyContext, simulationId: string): Promise<void> {
  const agents = await ctx.repos.agents.findBySimulation(simulationId);
  for (const agent of agents) {
    await ctx.repos.agents.update(agent.id, { state: { ...agent.state, hunger: agent.state.hunger + 1 } });
  }
}

export async function buyMeal(ctx: EconomyContext, agent: Agent, restaurantId: string, simulationId: string, gameDay: number): Promise<void> {
  const restaurant = await ctx.repos.businesses.findById(restaurantId);
  if (!restaurant || restaurant.type !== "RESTAURANT" || restaurant.status !== "ACTIVE" || restaurant.inventory.meals <= 0) {
    throw new ActionError("INVALID_BUSINESS", "Restaurant not found, closed, or out of meals");
  }

  const result = await ctx.ledger.transfer({
    simulationId,
    fromAgentId: agent.id,
    toAgentId: restaurant.ownerAgentId,
    grossAmount: restaurant.price,
    type: "PURCHASE",
    gameDay,
  });
  if (result.status !== "CONFIRMED") {
    throw new ActionError("INSUFFICIENT_FUNDS", result.failureReason ?? "Cannot afford a meal");
  }

  await ctx.repos.businesses.update(restaurant.id, {
    inventory: { ...restaurant.inventory, meals: restaurant.inventory.meals - 1 },
    statistics: {
      ...restaurant.statistics,
      revenue: restaurant.statistics.revenue + result.netAmount,
      profit: restaurant.statistics.profit + result.netAmount,
    },
  });
  await syncAgentCash(ctx, simulationId, agent.id);
  await syncAgentCash(ctx, simulationId, restaurant.ownerAgentId);
  await ctx.repos.agents.update(agent.id, {
    state: { ...agent.state, hunger: 0 },
    activity: applyActivityDelta(agent.activity, ACTIVITY_DELTA.BUY_MEAL, "BUY_MEAL", gameDay),
    statistics: { ...agent.statistics, transactions: agent.statistics.transactions + 1 },
  });
  await recordTransaction(ctx, { simulationId, type: "PURCHASE", fromAgentId: agent.id, toAgentId: restaurant.ownerAgentId, gameDay, result });
  await recordEvent(ctx, {
    simulationId,
    gameDay,
    type: "TRADE",
    agentIds: [agent.id, restaurant.ownerAgentId],
    message: `Agent ${agent.id} bought a meal`,
    metadata: { restaurantId },
  });
}
