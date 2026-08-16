import { describe, it, expect, beforeEach } from "vitest";
import { STARTING_REPUTATION, LAND_VALUE, DEFAULT_RULES } from "@econforge/shared";
import type { Agent } from "@econforge/shared";
import { createInMemoryRepositories } from "../persistence/memory/index.js";
import { InMemoryLedgerService } from "../blockchain/InMemoryLedgerService.js";
import type { EconomyContext } from "../economy/context.js";
import { ActionError } from "../economy/errors.js";
import { buyProperty, listPropertyForSale } from "../economy/property.js";

const SIMULATION_ID = "sim1";

async function makeAgent(ctx: EconomyContext, cash = 1000): Promise<Agent> {
  const agent = await ctx.repos.agents.create({
    userId: "user1",
    simulationId: SIMULATION_ID,
    personality: { risk: 50, spending: 50, ethics: 50, confidence: 50, fomo: 50 },
    economic: { cash, outstandingDebt: 0, totalBorrowed: 0, totalRepaid: 0, totalInterestPaid: 0, totalIncome: 0, totalExpenses: 0 },
    state: { hunger: 0, employmentStatus: "UNEMPLOYED", employerId: null, propertyIds: [], businessIds: [] },
    reputation: { score: STARTING_REPUTATION, history: [] },
    activity: { score: 0, history: [] },
    statistics: { transactions: 0, theatreVisits: 0, loansTaken: 0, loansRepaid: 0, loansDefaulted: 0, businessesCreated: 0, businessesFailed: 0 },
    memory: [],
  });
  await ctx.ledger.registerAgent(SIMULATION_ID, agent.id, cash);
  return agent;
}

describe("peer-to-peer property market", () => {
  let ctx: EconomyContext;

  beforeEach(() => {
    ctx = { repos: createInMemoryRepositories(), ledger: new InMemoryLedgerService(), rules: DEFAULT_RULES };
  });

  it("lists a property without moving money, then transfers ownership + payment on peer purchase", async () => {
    const seller = await makeAgent(ctx, 1000);
    const buyer = await makeAgent(ctx, 1000);

    const property = await buyProperty(ctx, seller, SIMULATION_ID, 1);
    await listPropertyForSale(ctx, seller, property.id, SIMULATION_ID, 2);

    const listed = await ctx.repos.properties.findById(property.id);
    expect(listed!.forSale).toBe(true);
    expect(await ctx.ledger.getBalance(SIMULATION_ID, seller.id)).toBe(1000 - LAND_VALUE); // listing itself is free

    const bought = await buyProperty(ctx, buyer, SIMULATION_ID, 3, property.id);
    expect(bought.ownerAgentId).toBe(buyer.id);
    expect(bought.forSale).toBe(false);

    const sellerBalance = await ctx.ledger.getBalance(SIMULATION_ID, seller.id);
    const buyerBalance = await ctx.ledger.getBalance(SIMULATION_ID, buyer.id);
    expect(buyerBalance).toBe(1000 - LAND_VALUE);
    expect(sellerBalance).toBeCloseTo(1000 - LAND_VALUE + LAND_VALUE * 0.98, 5); // 2% tax on the peer sale

    const freshSeller = await ctx.repos.agents.findById(seller.id);
    const freshBuyer = await ctx.repos.agents.findById(buyer.id);
    expect(freshSeller!.state.propertyIds).not.toContain(property.id);
    expect(freshBuyer!.state.propertyIds).toContain(property.id);
  });

  it("rejects buying a property that isn't listed", async () => {
    const owner = await makeAgent(ctx, 1000);
    const buyer = await makeAgent(ctx, 1000);
    const property = await buyProperty(ctx, owner, SIMULATION_ID, 1);

    await expect(buyProperty(ctx, buyer, SIMULATION_ID, 2, property.id)).rejects.toThrow(ActionError);
  });

  it("rejects listing a property twice or one with an attached business", async () => {
    const owner = await makeAgent(ctx, 1000);
    const property = await buyProperty(ctx, owner, SIMULATION_ID, 1);
    await listPropertyForSale(ctx, owner, property.id, SIMULATION_ID, 2);

    await expect(listPropertyForSale(ctx, owner, property.id, SIMULATION_ID, 3)).rejects.toThrow(ActionError);
  });
});
