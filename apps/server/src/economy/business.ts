import type { Agent, Business, BusinessType } from "@econforge/shared";
import {
  BUSINESS_PROPERTY_COST,
  BUSINESS_WAGE_COST,
  BUSINESS_FAILURE_DAYS,
  BUSINESS_WORKERS_REQUIRED,
  CONSTRUCTION_VALUE,
  FARM_DAILY_OUTPUT,
  FOOD_UNIT_PRICE,
  DEFAULT_MEAL_PRICE,
  DEFAULT_TICKET_PRICE,
  ACTIVITY_DELTA,
  REPUTATION_DELTA,
} from "@econforge/shared";
import type { EconomyContext } from "./context.js";
import { ActionError } from "./errors.js";
import { syncAgentCash } from "./sync.js";
import { recordTransaction, recordEvent } from "./record.js";
import { applyActivityDelta } from "./activity.js";
import { applyReputationDelta } from "./reputation.js";
import { autoFillVacancies } from "./labor.js";

function defaultPrice(type: BusinessType): number {
  if (type === "RESTAURANT") return DEFAULT_MEAL_PRICE;
  if (type === "THEATRE") return DEFAULT_TICKET_PRICE;
  return 0; // farms don't sell to end consumers
}

/** flow.md §7: Buy/build property -> find workers -> set wage -> ACTIVE (once staffed). */
export async function startBusiness(
  ctx: EconomyContext,
  agent: Agent,
  type: BusinessType,
  simulationId: string,
  gameDay: number,
): Promise<Business> {
  const spareLand = (await ctx.repos.properties.findByOwner(agent.id)).find(
    (p) => p.type === "LAND" && p.businessId === null && !p.forSale,
  );

  let propertyId: string;
  const cost = spareLand ? CONSTRUCTION_VALUE : BUSINESS_PROPERTY_COST;

  const payment = await ctx.ledger.transfer({
    simulationId,
    fromAgentId: agent.id,
    toAgentId: null,
    grossAmount: cost,
    type: "PROPERTY",
    gameDay,
  });
  if (payment.status !== "CONFIRMED") {
    throw new ActionError("INSUFFICIENT_FUNDS", payment.failureReason ?? "Cannot afford to start this business");
  }

  if (spareLand) {
    const upgraded = await ctx.repos.properties.update(spareLand.id, {
      type,
      constructionValue: CONSTRUCTION_VALUE,
      marketValue: spareLand.landValue + CONSTRUCTION_VALUE,
    });
    propertyId = upgraded.id;
  } else {
    const created = await ctx.repos.properties.create({
      simulationId,
      ownerAgentId: agent.id,
      type,
      landValue: BUSINESS_PROPERTY_COST / 2,
      constructionValue: BUSINESS_PROPERTY_COST / 2,
      marketValue: BUSINESS_PROPERTY_COST,
      businessId: null,
      forSale: false,
    });
    propertyId = created.id;
  }

  const business = await ctx.repos.businesses.create({
    simulationId,
    ownerAgentId: agent.id,
    type,
    propertyId,
    status: "INACTIVE",
    employees: [],
    price: defaultPrice(type),
    inventory: { food: 0, meals: 0 },
    statistics: { revenue: 0, expenses: 0, profit: 0, daysActive: 0, failedDays: 0 },
  });
  await ctx.repos.properties.update(propertyId, { businessId: business.id });

  await syncAgentCash(ctx, simulationId, agent.id);
  await ctx.repos.agents.update(agent.id, {
    state: { ...agent.state, businessIds: [...agent.state.businessIds, business.id], propertyIds: [...new Set([...agent.state.propertyIds, propertyId])] },
    statistics: { ...agent.statistics, businessesCreated: agent.statistics.businessesCreated + 1 },
    activity: applyActivityDelta(agent.activity, ACTIVITY_DELTA.START_BUSINESS, "START_BUSINESS", gameDay),
  });
  await recordTransaction(ctx, { simulationId, type: "PROPERTY", fromAgentId: agent.id, toAgentId: null, gameDay, result: payment });

  // Try to staff it immediately (flow.md's "Find 2 workers" step); the
  // day-start autoFillVacancies pass is the safety net if nobody's free yet.
  await autoFillVacancies(ctx, simulationId, gameDay);
  const staffed = await ctx.repos.businesses.findById(business.id);

  await recordEvent(ctx, {
    simulationId,
    gameDay,
    type: "BUSINESS_CREATED",
    agentIds: [agent.id],
    message: `Agent ${agent.id} started a ${type.toLowerCase()}`,
    metadata: { businessId: business.id },
  });

  return staffed ?? business;
}

/** Deterministic per-day step (flow.md §4/§8): farms produce food while ACTIVE. */
export async function processDailyProduction(ctx: EconomyContext, simulationId: string, foodOutputMultiplier = 1): Promise<void> {
  const farms = await ctx.repos.businesses.findBySimulation(simulationId, { type: "FARM", status: "ACTIVE" });
  for (const farm of farms) {
    const output = Math.round(FARM_DAILY_OUTPUT * foodOutputMultiplier);
    await ctx.repos.businesses.update(farm.id, {
      inventory: { ...farm.inventory, food: farm.inventory.food + output },
      statistics: { ...farm.statistics, daysActive: farm.statistics.daysActive + 1 },
    });
  }

  // Restaurants convert whatever food they're holding into sellable meals, 1:1.
  const restaurants = await ctx.repos.businesses.findBySimulation(simulationId, { type: "RESTAURANT", status: "ACTIVE" });
  for (const restaurant of restaurants) {
    if (restaurant.inventory.food > 0) {
      await ctx.repos.businesses.update(restaurant.id, {
        inventory: { food: 0, meals: restaurant.inventory.meals + restaurant.inventory.food },
        statistics: { ...restaurant.statistics, daysActive: restaurant.statistics.daysActive + 1 },
      });
    } else {
      await ctx.repos.businesses.update(restaurant.id, {
        statistics: { ...restaurant.statistics, daysActive: restaurant.statistics.daysActive + 1 },
      });
    }
  }

  const theatres = await ctx.repos.businesses.findBySimulation(simulationId, { type: "THEATRE", status: "ACTIVE" });
  for (const theatre of theatres) {
    await ctx.repos.businesses.update(theatre.id, {
      statistics: { ...theatre.statistics, daysActive: theatre.statistics.daysActive + 1 },
    });
  }
}

/** Deterministic per-day step: owner pays each employee WORKER_WAGE, taxed (prd.md §10/§12). */
export async function payWages(ctx: EconomyContext, simulationId: string, gameDay: number): Promise<void> {
  const businesses = (await ctx.repos.businesses.findBySimulation(simulationId)).filter((b) => b.status !== "FAILED");

  for (const business of businesses) {
    if (business.employees.length === 0) continue;
    const owner = await ctx.repos.agents.findById(business.ownerAgentId);
    if (!owner) continue;

    const totalWageCost = business.employees.reduce((sum, e) => sum + e.wage, 0);
    const ownerBalance = await ctx.ledger.getBalance(simulationId, owner.id);

    if (ownerBalance < totalWageCost) {
      // Can't cover payroll today: reputation hit, counts toward the 3-day failure rule.
      await ctx.repos.agents.update(owner.id, {
        reputation: applyReputationDelta(owner.reputation, REPUTATION_DELTA.UNPAID_WAGES, "UNPAID_WAGES", gameDay),
      });
      await checkAndApplyFailure(ctx, business, simulationId, gameDay, true);
      continue;
    }

    let paidAll = true;
    for (const employee of business.employees) {
      const result = await ctx.ledger.transfer({
        simulationId,
        fromAgentId: owner.id,
        toAgentId: employee.agentId,
        grossAmount: employee.wage,
        type: "WAGE",
        gameDay,
      });
      if (result.status !== "CONFIRMED") {
        paidAll = false;
        continue;
      }
      await syncAgentCash(ctx, simulationId, employee.agentId);
      await recordTransaction(ctx, { simulationId, type: "WAGE", fromAgentId: owner.id, toAgentId: employee.agentId, gameDay, result });
    }
    await syncAgentCash(ctx, simulationId, owner.id);

    const freshOwner = await ctx.repos.agents.findById(owner.id);
    if (freshOwner) {
      await ctx.repos.agents.update(owner.id, {
        economic: { ...freshOwner.economic, totalExpenses: freshOwner.economic.totalExpenses + totalWageCost },
        reputation: paidAll
          ? applyReputationDelta(freshOwner.reputation, REPUTATION_DELTA.WAGES_PAID_ON_TIME, "WAGES_PAID_ON_TIME", gameDay)
          : freshOwner.reputation,
      });
    }
    await ctx.repos.businesses.update(business.id, {
      statistics: { ...business.statistics, expenses: business.statistics.expenses + totalWageCost },
    });
    await checkAndApplyFailure(ctx, business, simulationId, gameDay, false);
  }
}

async function checkAndApplyFailure(
  ctx: EconomyContext,
  business: Business,
  simulationId: string,
  gameDay: number,
  failedToday: boolean,
): Promise<void> {
  const understaffed = business.employees.length < BUSINESS_WORKERS_REQUIRED;
  const failedDays = failedToday || understaffed ? business.statistics.failedDays + 1 : 0;

  const patch: Partial<Business> = { statistics: { ...business.statistics, failedDays } };
  if (failedDays >= BUSINESS_FAILURE_DAYS) {
    patch.status = "FAILED";
  } else if (failedToday || understaffed) {
    patch.status = "INACTIVE";
  } else if (business.status === "INACTIVE" && !understaffed) {
    patch.status = "ACTIVE";
  }

  const updated = await ctx.repos.businesses.update(business.id, patch);
  if (updated.status === "FAILED" && business.status !== "FAILED") {
    const owner = await ctx.repos.agents.findById(business.ownerAgentId);
    if (owner) {
      await ctx.repos.agents.update(owner.id, {
        statistics: { ...owner.statistics, businessesFailed: owner.statistics.businessesFailed + 1 },
      });
    }
    await recordEvent(ctx, {
      simulationId,
      gameDay,
      type: "BUSINESS_FAILED",
      agentIds: [business.ownerAgentId],
      message: `${business.type} owned by ${business.ownerAgentId} failed after ${BUSINESS_FAILURE_DAYS} bad days`,
      metadata: { businessId: business.id },
    });
  }
}

/**
 * Generic bilateral food trade — either side can initiate it (buyFood /
 * sellFood below are just which candidate list it was offered on). No
 * hardcoded "farms sell, restaurants buy": any business currently holding
 * food is a valid seller, any business is a valid buyer, regardless of
 * sector. Money moves buyer -> seller's owner, taxed like any purchase;
 * inventory moves seller -> buyer.
 */
async function tradeFood(
  ctx: EconomyContext,
  buyerBusinessId: string,
  sellerBusinessId: string,
  units: number,
  simulationId: string,
  gameDay: number,
): Promise<void> {
  const buyer = await ctx.repos.businesses.findById(buyerBusinessId);
  const seller = await ctx.repos.businesses.findById(sellerBusinessId);
  if (!buyer || !seller || buyer.id === seller.id) {
    throw new ActionError("INVALID_BUSINESS", "Invalid buyer/seller pair");
  }
  const boundedUnits = Math.max(1, Math.min(units, seller.inventory.food));
  if (boundedUnits <= 0) {
    throw new ActionError("INVALID_ACTION", "Seller has no food to sell");
  }
  const cost = boundedUnits * FOOD_UNIT_PRICE;

  const buyerOwner = await ctx.repos.agents.findById(buyer.ownerAgentId);
  if (!buyerOwner) throw new ActionError("NOT_FOUND", "Buyer's owner not found");

  const result = await ctx.ledger.transfer({
    simulationId,
    fromAgentId: buyer.ownerAgentId,
    toAgentId: seller.ownerAgentId,
    grossAmount: cost,
    type: "PURCHASE",
    gameDay,
  });
  if (result.status !== "CONFIRMED") {
    throw new ActionError("INSUFFICIENT_FUNDS", result.failureReason ?? "Cannot afford food purchase");
  }

  await ctx.repos.businesses.update(seller.id, { inventory: { ...seller.inventory, food: seller.inventory.food - boundedUnits } });
  await ctx.repos.businesses.update(buyer.id, { inventory: { ...buyer.inventory, food: buyer.inventory.food + boundedUnits } });

  await syncAgentCash(ctx, simulationId, buyer.ownerAgentId);
  await syncAgentCash(ctx, simulationId, seller.ownerAgentId);
  await ctx.repos.agents.update(buyer.ownerAgentId, {
    activity: applyActivityDelta(buyerOwner.activity, ACTIVITY_DELTA.TRADE, "TRADE", gameDay),
    statistics: { ...buyerOwner.statistics, transactions: buyerOwner.statistics.transactions + 1 },
  });
  await recordTransaction(ctx, { simulationId, type: "PURCHASE", fromAgentId: buyer.ownerAgentId, toAgentId: seller.ownerAgentId, gameDay, result });
  await recordEvent(ctx, {
    simulationId,
    gameDay,
    type: "TRADE",
    agentIds: [buyer.ownerAgentId, seller.ownerAgentId],
    message: `${buyer.type} bought ${boundedUnits} food from a ${seller.type.toLowerCase()}`,
    metadata: { buyerBusinessId, sellerBusinessId, units: boundedUnits },
  });
}

/** BUY_GOOD: acting agent's business restocks food from any other business holding it. */
export async function buyFood(ctx: EconomyContext, buyerOwner: Agent, buyerBusinessId: string, sellerBusinessId: string, units: number, simulationId: string, gameDay: number): Promise<void> {
  const buyerBusiness = await ctx.repos.businesses.findById(buyerBusinessId);
  if (!buyerBusiness || buyerBusiness.ownerAgentId !== buyerOwner.id) {
    throw new ActionError("INVALID_BUSINESS", "Agent does not own the buying business");
  }
  await tradeFood(ctx, buyerBusinessId, sellerBusinessId, units, simulationId, gameDay);
}

/** SELL_GOOD: acting agent's business offloads food surplus to any other business that needs it. */
export async function sellFood(ctx: EconomyContext, sellerOwner: Agent, sellerBusinessId: string, buyerBusinessId: string, units: number, simulationId: string, gameDay: number): Promise<void> {
  const sellerBusiness = await ctx.repos.businesses.findById(sellerBusinessId);
  if (!sellerBusiness || sellerBusiness.ownerAgentId !== sellerOwner.id) {
    throw new ActionError("INVALID_BUSINESS", "Agent does not own the selling business");
  }
  await tradeFood(ctx, buyerBusinessId, sellerBusinessId, units, simulationId, gameDay);
}

/** VISIT_THEATRE candidate action. */
export async function visitTheatre(ctx: EconomyContext, agent: Agent, theatreId: string, simulationId: string, gameDay: number): Promise<void> {
  const theatre = await ctx.repos.businesses.findById(theatreId);
  if (!theatre || theatre.type !== "THEATRE" || theatre.status !== "ACTIVE") {
    throw new ActionError("INVALID_BUSINESS", "Theatre not found or not open");
  }
  const result = await ctx.ledger.transfer({
    simulationId,
    fromAgentId: agent.id,
    toAgentId: theatre.ownerAgentId,
    grossAmount: theatre.price,
    type: "PURCHASE",
    gameDay,
  });
  if (result.status !== "CONFIRMED") {
    throw new ActionError("INSUFFICIENT_FUNDS", result.failureReason ?? "Cannot afford a ticket");
  }

  await ctx.repos.businesses.update(theatre.id, {
    statistics: {
      ...theatre.statistics,
      revenue: theatre.statistics.revenue + result.netAmount,
      profit: theatre.statistics.profit + result.netAmount,
    },
  });
  await syncAgentCash(ctx, simulationId, agent.id);
  await syncAgentCash(ctx, simulationId, theatre.ownerAgentId);
  await ctx.repos.agents.update(agent.id, {
    activity: applyActivityDelta(agent.activity, ACTIVITY_DELTA.THEATRE_VISIT, "THEATRE_VISIT", gameDay),
    statistics: {
      ...agent.statistics,
      theatreVisits: agent.statistics.theatreVisits + 1,
      transactions: agent.statistics.transactions + 1,
    },
  });
  await recordTransaction(ctx, { simulationId, type: "PURCHASE", fromAgentId: agent.id, toAgentId: theatre.ownerAgentId, gameDay, result });
  await recordEvent(ctx, {
    simulationId,
    gameDay,
    type: "THEATRE_VISIT",
    agentIds: [agent.id, theatre.ownerAgentId],
    message: `Agent ${agent.id} visited a theatre`,
    metadata: { theatreId },
  });
}

export { BUSINESS_WAGE_COST };
