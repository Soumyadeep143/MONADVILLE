import type { Agent, Property } from "@econforge/shared";
import { LAND_VALUE, ACTIVITY_DELTA } from "@econforge/shared";
import type { EconomyContext } from "./context.js";
import { ActionError } from "./errors.js";
import { syncAgentCash } from "./sync.js";
import { recordTransaction, recordEvent } from "./record.js";
import { applyActivityDelta } from "./activity.js";

// Two ways to acquire property: unclaimed land from the commons (paid to
// the treasury — there's no peer seller for land nobody owns yet), or a
// listing another agent put up via listPropertyForSale(). buyProperty()
// dispatches on whether a target listing id is given.

async function buyUnclaimedLand(ctx: EconomyContext, agent: Agent, simulationId: string, gameDay: number): Promise<Property> {
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
    forSale: false,
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
    message: `Agent ${agent.id} bought unclaimed land`,
    metadata: { propertyId: property.id },
  });

  return property;
}

async function buyListedProperty(ctx: EconomyContext, agent: Agent, propertyId: string, simulationId: string, gameDay: number): Promise<Property> {
  const property = await ctx.repos.properties.findById(propertyId);
  if (!property || !property.forSale || property.ownerAgentId === agent.id) {
    throw new ActionError("INVALID_PROPERTY", "Property is not for sale or not found");
  }
  const seller = await ctx.repos.agents.findById(property.ownerAgentId);
  if (!seller) throw new ActionError("NOT_FOUND", "Seller not found");

  const result = await ctx.ledger.transfer({
    simulationId,
    fromAgentId: agent.id,
    toAgentId: seller.id,
    grossAmount: property.marketValue,
    type: "PROPERTY",
    gameDay,
  });
  if (result.status !== "CONFIRMED") {
    throw new ActionError("INSUFFICIENT_FUNDS", result.failureReason ?? "Cannot afford this property");
  }

  const updated = await ctx.repos.properties.update(property.id, { ownerAgentId: agent.id, forSale: false });

  await syncAgentCash(ctx, simulationId, agent.id);
  await syncAgentCash(ctx, simulationId, seller.id);
  await ctx.repos.agents.update(agent.id, {
    state: { ...agent.state, propertyIds: [...agent.state.propertyIds, property.id] },
    activity: applyActivityDelta(agent.activity, ACTIVITY_DELTA.BUY_PROPERTY, "BUY_PROPERTY", gameDay),
  });
  await ctx.repos.agents.update(seller.id, {
    state: { ...seller.state, propertyIds: seller.state.propertyIds.filter((id) => id !== property.id) },
    activity: applyActivityDelta(seller.activity, ACTIVITY_DELTA.TRADE, "TRADE", gameDay),
    statistics: { ...seller.statistics, transactions: seller.statistics.transactions + 1 },
  });
  await recordTransaction(ctx, { simulationId, type: "PROPERTY", fromAgentId: agent.id, toAgentId: seller.id, gameDay, result });
  await recordEvent(ctx, {
    simulationId,
    gameDay,
    type: "TRADE",
    agentIds: [agent.id, seller.id],
    message: `Agent ${agent.id} bought a property from agent ${seller.id} for ${property.marketValue}`,
    metadata: { propertyId: property.id, price: property.marketValue },
  });

  return updated;
}

/** BUY_PROPERTY candidate action: buys unclaimed land when no target is given, or a specific peer listing otherwise. */
export async function buyProperty(ctx: EconomyContext, agent: Agent, simulationId: string, gameDay: number, targetPropertyId?: string | null): Promise<Property> {
  return targetPropertyId ? buyListedProperty(ctx, agent, targetPropertyId, simulationId, gameDay) : buyUnclaimedLand(ctx, agent, simulationId, gameDay);
}

/**
 * SELL_PROPERTY candidate action: lists the property on the peer market at
 * its current marketValue. No money moves here — a sale only completes when
 * another agent's BUY_PROPERTY targets this listing (buyListedProperty
 * above). Properties can sit listed indefinitely if nobody buys; the owner
 * keeps it (and could in principle still hold it — there's no unlist action
 * in this pass).
 */
export async function listPropertyForSale(ctx: EconomyContext, agent: Agent, propertyId: string, simulationId: string, gameDay: number): Promise<void> {
  const property = await ctx.repos.properties.findById(propertyId);
  if (!property || property.ownerAgentId !== agent.id) {
    throw new ActionError("INVALID_PROPERTY", "Property not found or not owned by agent");
  }
  if (property.businessId) {
    throw new ActionError("INVALID_PROPERTY", "Cannot sell a property with an active business on it");
  }
  if (property.forSale) {
    throw new ActionError("INVALID_PROPERTY", "Property is already listed for sale");
  }

  await ctx.repos.properties.update(property.id, { forSale: true });
  await ctx.repos.agents.update(agent.id, {
    activity: applyActivityDelta(agent.activity, ACTIVITY_DELTA.SELL_PROPERTY, "SELL_PROPERTY", gameDay),
  });
  await recordEvent(ctx, {
    simulationId,
    gameDay,
    type: "TRADE",
    agentIds: [agent.id],
    message: `Agent ${agent.id} listed a property for sale at ${property.marketValue}`,
    metadata: { propertyId },
  });
}
