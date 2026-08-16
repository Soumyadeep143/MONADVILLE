import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_MEAL_PRICE, DEFAULT_RULES } from "@econforge/shared";
import { createInMemoryRepositories } from "../persistence/memory/index.js";
import { InMemoryLedgerService } from "../blockchain/InMemoryLedgerService.js";
import type { EconomyContext } from "../economy/context.js";
import { adjustPrices } from "../economy/pricing.js";

const SIMULATION_ID = "sim1";

async function makeRestaurant(ctx: EconomyContext, price: number, meals: number) {
  return ctx.repos.businesses.create({
    simulationId: SIMULATION_ID,
    ownerAgentId: "owner",
    type: "RESTAURANT",
    propertyId: "prop",
    status: "ACTIVE",
    employees: [
      { agentId: "e1", wage: 20 },
      { agentId: "e2", wage: 20 },
    ],
    price,
    inventory: { food: 0, meals },
    statistics: { revenue: 0, expenses: 0, profit: 0, daysActive: 0, failedDays: 0 },
  });
}

describe("Bertrand-style pricing", () => {
  let ctx: EconomyContext;

  beforeEach(() => {
    ctx = { repos: createInMemoryRepositories(), ledger: new InMemoryLedgerService(), rules: DEFAULT_RULES };
  });

  it("undercuts toward the cheapest competitor", async () => {
    const expensive = await makeRestaurant(ctx, 20, 5);
    await makeRestaurant(ctx, 10, 5);

    await adjustPrices(ctx, SIMULATION_ID);

    const updated = await ctx.repos.businesses.findById(expensive.id);
    expect(updated!.price).toBeLessThan(20);
    expect(updated!.price).toBeGreaterThanOrEqual(10);
  });

  it("raises price when already cheapest and sold out", async () => {
    const soldOut = await makeRestaurant(ctx, 10, 0);
    await makeRestaurant(ctx, 15, 5);

    await adjustPrices(ctx, SIMULATION_ID);

    const updated = await ctx.repos.businesses.findById(soldOut.id);
    expect(updated!.price).toBeGreaterThan(10);
  });

  it("drifts up slowly with no competitors (monopoly power)", async () => {
    const monopolist = await makeRestaurant(ctx, DEFAULT_MEAL_PRICE, 5);

    await adjustPrices(ctx, SIMULATION_ID);

    const updated = await ctx.repos.businesses.findById(monopolist.id);
    expect(updated!.price).toBeGreaterThan(DEFAULT_MEAL_PRICE);
  });

  it("never drops below the price floor", async () => {
    const cheap = await makeRestaurant(ctx, 4.1, 5);
    await makeRestaurant(ctx, 3, 5);

    await adjustPrices(ctx, SIMULATION_ID);
    await adjustPrices(ctx, SIMULATION_ID);
    await adjustPrices(ctx, SIMULATION_ID);

    const updated = await ctx.repos.businesses.findById(cheap.id);
    expect(updated!.price).toBeGreaterThanOrEqual(4);
  });
});
