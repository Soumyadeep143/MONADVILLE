import { describe, it, expect, beforeEach } from "vitest";
import { STARTING_REPUTATION, BUSINESS_FAILURE_DAYS, DEFAULT_RULES } from "@econforge/shared";
import type { Agent } from "@econforge/shared";
import { createInMemoryRepositories } from "../persistence/memory/index.js";
import { InMemoryLedgerService } from "../blockchain/InMemoryLedgerService.js";
import type { EconomyContext } from "../economy/context.js";
import { payWages } from "../economy/business.js";

const SIMULATION_ID = "sim1";

async function makeAgent(ctx: EconomyContext, cash: number): Promise<Agent> {
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

describe("business 3-day failure rule", () => {
  let ctx: EconomyContext;

  beforeEach(() => {
    ctx = { repos: createInMemoryRepositories(), ledger: new InMemoryLedgerService(), rules: DEFAULT_RULES };
  });

  it("marks a business FAILED after 3 consecutive days of unpaid wages, and never operates with fewer than 2 employees", async () => {
    const owner = await makeAgent(ctx, 5); // cannot cover 40/day wages
    const employee1 = await makeAgent(ctx, 0);
    const employee2 = await makeAgent(ctx, 0);

    const business = await ctx.repos.businesses.create({
      simulationId: SIMULATION_ID,
      ownerAgentId: owner.id,
      type: "FARM",
      propertyId: "prop1",
      status: "ACTIVE",
      employees: [
        { agentId: employee1.id, wage: 20 },
        { agentId: employee2.id, wage: 20 },
      ],
      price: 0,
      inventory: { food: 0, meals: 0 },
      statistics: { revenue: 0, expenses: 0, profit: 0, daysActive: 0, failedDays: 0 },
    });

    expect(business.employees.length).toBeGreaterThanOrEqual(2);

    for (let day = 1; day <= BUSINESS_FAILURE_DAYS; day++) {
      await payWages(ctx, SIMULATION_ID, day);
    }

    const final = await ctx.repos.businesses.findById(business.id);
    expect(final!.status).toBe("FAILED");
    expect(final!.statistics.failedDays).toBeGreaterThanOrEqual(BUSINESS_FAILURE_DAYS);

    // invariant: a business is never ACTIVE with fewer than 2 employees
    const all = await ctx.repos.businesses.findBySimulation(SIMULATION_ID);
    expect(all.every((b) => b.status !== "ACTIVE" || b.employees.length >= 2)).toBe(true);
  });
});
