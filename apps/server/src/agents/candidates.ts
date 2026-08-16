import type { Agent, Business, CandidateAction } from "@econforge/shared";
import { BUSINESS_PROPERTY_COST, CONSTRUCTION_VALUE, FOOD_UNIT_PRICE, LAND_VALUE, LOAN_MAX_PERCENT_BPS, bps } from "@econforge/shared";
import type { EconomyContext } from "../economy/context.js";
import { computeNetWorth } from "../economy/loan.js";

const FOOD_SURPLUS_THRESHOLD = 20;
const FOOD_LOW_THRESHOLD = 10;

/**
 * prd.md §17: "Only actions valid for the current state should be offered."
 * Every option here is something the agent can legally do right now — the
 * LLM/fallback decision layer only ever picks among these by id, never
 * invents its own action/target/amount (see decisionEngine.ts).
 *
 * Trading is bilateral and sector-agnostic: any business currently holding
 * a sellable good is a valid counterparty for BUY_GOOD, and any business
 * this agent owns with surplus goods can initiate SELL_GOOD toward any
 * business that needs them — there's no hardcoded "farms only sell to
 * restaurants" rule, just whoever currently has stock and whoever needs it.
 */
export async function generateCandidateActions(
  ctx: EconomyContext,
  agent: Agent,
  simulationId: string,
  gameDay: number,
): Promise<CandidateAction[]> {
  const candidates: CandidateAction[] = [];
  const push = (c: Omit<CandidateAction, "id">) => {
    candidates.push({ ...c, id: `choice_${candidates.length + 1}` });
  };

  const businesses = await ctx.repos.businesses.findBySimulation(simulationId);
  const properties = await ctx.repos.properties.findBySimulation(simulationId);

  push({ action: "SAVE", targetId: null, amount: null, description: "Do nothing this turn and hold your cash." });

  if (agent.state.employmentStatus === "UNEMPLOYED") {
    const openings = businesses.filter((b) => b.status !== "FAILED" && b.employees.length < 2).slice(0, 3);
    for (const b of openings) {
      push({ action: "WORK", targetId: b.id, amount: null, description: `Join a ${b.type.toLowerCase()} as an employee (wage 20/day).` });
    }
  }

  if (agent.state.hunger > 0) {
    const restaurant = businesses.find((b) => b.type === "RESTAURANT" && b.status === "ACTIVE" && b.inventory.meals > 0);
    if (restaurant) {
      push({
        action: "BUY_MEAL",
        targetId: restaurant.id,
        amount: restaurant.price,
        description: `Buy a meal for ${restaurant.price} coins (hunger: ${agent.state.hunger}).`,
      });
    }
  }

  const theatre = businesses.find((b) => b.type === "THEATRE" && b.status === "ACTIVE");
  if (theatre && agent.economic.cash >= theatre.price) {
    push({
      action: "VISIT_THEATRE",
      targetId: theatre.id,
      amount: theatre.price,
      description: `Buy a theatre ticket for ${theatre.price} coins.`,
    });
  }

  if (agent.economic.cash >= LAND_VALUE) {
    push({ action: "BUY_PROPERTY", targetId: null, amount: LAND_VALUE, description: `Buy a plot of land for ${LAND_VALUE} coins.` });
  }

  const sellableProperty = properties.find((p) => p.ownerAgentId === agent.id && !p.businessId);
  if (sellableProperty) {
    push({
      action: "SELL_PROPERTY",
      targetId: sellableProperty.id,
      amount: sellableProperty.marketValue,
      description: `Sell your land for ${sellableProperty.marketValue} coins.`,
    });
  }

  const spareLand = properties.find((p) => p.ownerAgentId === agent.id && p.type === "LAND" && !p.businessId);
  const startCost = spareLand ? CONSTRUCTION_VALUE : BUSINESS_PROPERTY_COST;
  if (agent.economic.cash >= startCost) {
    for (const type of ["FARM", "RESTAURANT", "THEATRE"] as const) {
      push({
        action: `START_${type}` as CandidateAction["action"],
        targetId: null,
        amount: startCost,
        description: `Start a ${type.toLowerCase()} for ${startCost} coins.`,
      });
    }
  }

  const activeLoans = (await ctx.repos.loans.findByAgent(agent.id)).filter((l) => l.status === "ACTIVE");
  const hasOverdue = activeLoans.some((l) => gameDay > l.dueDay);
  if (!hasOverdue) {
    const worth = await computeNetWorth(ctx, agent);
    const maxLoan = bps(Math.max(worth, 0), LOAN_MAX_PERCENT_BPS);
    const treasuryBalance = await ctx.ledger.getTreasuryBalance(simulationId);
    const suggested = Math.min(maxLoan, treasuryBalance);
    if (suggested >= 10) {
      push({
        action: "TAKE_LOAN",
        targetId: null,
        amount: Math.round(suggested),
        description: `Take a loan of up to ${Math.round(suggested)} coins (50% of net worth, 10% interest, due in 10 days).`,
      });
    }
  }
  for (const loan of activeLoans) {
    if (agent.economic.cash >= loan.totalRepayment) {
      push({
        action: "REPAY_LOAN",
        targetId: loan.id,
        amount: loan.totalRepayment,
        description: `Repay your loan of ${loan.totalRepayment} coins (due day ${loan.dueDay}).`,
      });
    }
  }

  // BUY_GOOD: this agent owns a business low on food -> any business of any
  // type currently holding food surplus is a valid seller (not just farms).
  const ownBusinesses = businesses.filter((b) => b.ownerAgentId === agent.id);
  const needsFood = ownBusinesses.find((b) => b.status !== "FAILED" && b.inventory.food < FOOD_LOW_THRESHOLD && (b.type === "RESTAURANT" || b.type === "FARM"));
  if (needsFood) {
    const sellers = businesses.filter((b) => b.id !== needsFood.id && b.inventory.food > 0).sort((a, b) => b.inventory.food - a.inventory.food);
    for (const seller of sellers.slice(0, 2)) {
      if (agent.economic.cash < FOOD_UNIT_PRICE) break;
      const units = Math.min(10, seller.inventory.food, Math.floor(agent.economic.cash / FOOD_UNIT_PRICE));
      if (units <= 0) continue;
      push({
        action: "BUY_GOOD",
        targetId: seller.id,
        amount: units,
        description: `Buy ${units} food from a ${seller.type.toLowerCase()} to restock your ${needsFood.type.toLowerCase()}.`,
      });
    }
  }

  // SELL_GOOD: this agent owns a business sitting on food surplus -> any
  // other business (regardless of sector) currently low on food is a valid
  // buyer. Mirror of BUY_GOOD, initiated from the seller's side.
  const surplusBusiness = ownBusinesses.find((b) => b.status !== "FAILED" && b.inventory.food > FOOD_SURPLUS_THRESHOLD);
  if (surplusBusiness) {
    const buyers = businesses.filter((b) => b.id !== surplusBusiness.id && b.inventory.food < FOOD_LOW_THRESHOLD);
    for (const buyer of buyers.slice(0, 2)) {
      const units = Math.min(10, surplusBusiness.inventory.food - FOOD_LOW_THRESHOLD);
      if (units <= 0) continue;
      push({
        action: "SELL_GOOD",
        targetId: buyer.id,
        amount: units,
        description: `Sell ${units} surplus food from your ${surplusBusiness.type.toLowerCase()} to a ${buyer.type.toLowerCase()}.`,
      });
    }
  }

  return candidates;
}

export function resolveOwnBusiness(businesses: Business[], agentId: string, type: Business["type"]): Business | undefined {
  return businesses.find((b) => b.ownerAgentId === agentId && b.type === type && b.status !== "FAILED");
}
