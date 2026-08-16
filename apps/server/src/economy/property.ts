import type { Agent, Property } from "@econforge/shared";
import { LAND_VALUE, ACTIVITY_DELTA } from "@econforge/shared";
import type { EconomyContext } from "./context.js";
import { ActionError } from "./errors.js";
import { syncAgentCash } from "./sync.js";
import { recordTransaction, recordEvent } from "./record.js";
import { applyActivityDelta } from "./activity.js";

// Simplification for this POC pass: there's no peer-to-peer property listing
// market yet (see docs/architecture.md — "Properties can be bought/sold
// between players" is the long-term intent). Unclaimed land is bought from,
// and sold back to, the treasury at a fixed/marked value. This keeps money
// conserved (treasury is inside the closed system) without needing a full
// order-book. Swap in real peer trading later without touching callers —
// buyProperty/sellProperty are the only entry points.

export async function buyProperty(ctx: EconomyContext, agent: Agent, simulationId: string, gameDay: number): Promise<Property> {
  const result = await ctx.ledger.transfer({
    simulationId,
    fromAgentId: agent.id,
    toAgentId: null,
    grossAmount: LAND_VALUE,
    type: "PROPERTY",
    gameDay,
  });
  if (result.status !== "CONFIRMED") {
    throw new ActionError("INSUFFICIENT_FUNDS", result.failureReason ?? "Could not buy property");
  }

  const property = await ctx.repos.properties.create({
    simulationId,
    ownerAgentId: agent.id,
    type: "LAND",
    landValue: LAND_VALUE,
    constructionValue: 0,
    marketValue: LAND_VALUE,
    businessId: null,
  });

  await syncAgentCash(ctx, simulationId, agent.id);
  await ctx.repos.agents.update(agent.id, {
    state: { ...agent.state, propertyIds: [...agent.state.propertyIds, property.id] },
    activity: applyActivityDelta(agent.activity, ACTIVITY_DELTA.BUY_PROPERTY, "BUY_PROPERTY", gameDay),
  });
  await recordTransaction(ctx, { simulationId, type: "PROPERTY", fromAgentId: agent.id, toAgentId: null, gameDay, result });
  await recordEvent(ctx, {
    simulationId,
    gameDay,
    type: "TRADE",
    agentIds: [agent.id],
    message: `Agent ${agent.id} bought land`,
    metadata: { propertyId: property.id },
  });

  return property;
}

export async function sellProperty(ctx: EconomyContext, agent: Agent, propertyId: string, simulationId: string, gameDay: number): Promise<void> {
  const property = await ctx.repos.properties.findById(propertyId);
  if (!property || property.ownerAgentId !== agent.id) {
    throw new ActionError("INVALID_PROPERTY", "Property not found or not owned by agent");
  }
  if (property.businessId) {
    throw new ActionError("INVALID_PROPERTY", "Cannot sell a property with an active business on it");
  }

  const result = await ctx.ledger.transfer({
    simulationId,
    fromAgentId: null,
    toAgentId: agent.id,
    grossAmount: property.marketValue,
    type: "PROPERTY",
    gameDay,
    taxable: false, // reverse of a treasury purchase; no double taxation on unwind
  });
  if (result.status !== "CONFIRMED") {
    throw new ActionError("INSUFFICIENT_TREASURY", result.failureReason ?? "Treasury cannot buy back this property right now");
  }

  await syncAgentCash(ctx, simulationId, agent.id);
  await ctx.repos.agents.update(agent.id, {
    state: { ...agent.state, propertyIds: agent.state.propertyIds.filter((id) => id !== propertyId) },
    activity: applyActivityDelta(agent.activity, ACTIVITY_DELTA.SELL_PROPERTY, "SELL_PROPERTY", gameDay),
  });
  await recordTransaction(ctx, { simulationId, type: "PROPERTY", fromAgentId: null, toAgentId: agent.id, gameDay, result });
  await recordEvent(ctx, {
    simulationId,
    gameDay,
    type: "TRADE",
    agentIds: [agent.id],
    message: `Agent ${agent.id} sold property`,
    metadata: { propertyId },
  });
}
