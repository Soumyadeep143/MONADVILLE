import { describe, it, expect, beforeEach } from "vitest";
import { STARTING_REPUTATION, DEFAULT_RULES } from "@econforge/shared";
import type { Agent } from "@econforge/shared";
import { createInMemoryRepositories } from "../persistence/memory/index.js";
import { InMemoryLedgerService } from "../blockchain/InMemoryLedgerService.js";
import type { EconomyContext } from "../economy/context.js";
import { ActionError } from "../economy/errors.js";
import { takeLoan, repayLoan } from "../economy/loan.js";

const SIMULATION_ID = "sim1";
const STARTING_CASH = 1000;

async function makeAgent(ctx: EconomyContext, cash = STARTING_CASH): Promise<Agent> {
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

async function seedTreasury(ctx: EconomyContext, amount: number) {
  const donor = await makeAgent(ctx, amount);
  await ctx.ledger.transfer({ simulationId: SIMULATION_ID, fromAgentId: donor.id, toAgentId: null, grossAmount: amount, type: "TRANSFER", gameDay: 0, taxable: false });
}

describe("loan rules", () => {
  let ctx: EconomyContext;

  beforeEach(() => {
    ctx = { repos: createInMemoryRepositories(), ledger: new InMemoryLedgerService(), rules: DEFAULT_RULES };
  });

  it("rejects a loan above 50% of net worth", async () => {
    await seedTreasury(ctx, 10000);
    const agent = await makeAgent(ctx); // net worth = 1000 cash, max loan = 500

    await expect(takeLoan(ctx, agent, 501, SIMULATION_ID, 1)).rejects.toThrow(ActionError);
    await expect(takeLoan(ctx, agent, 500, SIMULATION_ID, 1)).resolves.toBeTruthy();
  });

  it("rejects a loan the treasury cannot cover", async () => {
    await seedTreasury(ctx, 100); // deliberately thin treasury
    const agent = await makeAgent(ctx);

    await expect(takeLoan(ctx, agent, 500, SIMULATION_ID, 1)).rejects.toThrow(ActionError);
  });

  it("blocks a second loan while one is overdue", async () => {
    await seedTreasury(ctx, 10000);
    const agent = await makeAgent(ctx);
    const loan = await takeLoan(ctx, agent, 100, SIMULATION_ID, 1); // dueDay = 11

    await expect(takeLoan(ctx, agent, 50, SIMULATION_ID, 12)).rejects.toThrow(ActionError); // overdue by 1 day
    expect(loan.dueDay).toBe(11);
  });

  it("honors a per-simulation rules override instead of the global default (prd.md §22 loan-policy experiments)", async () => {
    const looseCtx: EconomyContext = { ...ctx, rules: { ...DEFAULT_RULES, loanMaxPercentBps: 8000, loanInterestBps: 500, loanDurationDays: 20 } };
    await seedTreasury(looseCtx, 10000);
    const agent = await makeAgent(looseCtx); // net worth 1000, 80% cap = 800 (would be rejected at the 50% default)

    const loan = await takeLoan(looseCtx, agent, 800, SIMULATION_ID, 1);
    expect(loan.interestAmount).toBe(40); // 5% of 800, not the default 10%
    expect(loan.dueDay).toBe(21); // issued day 1 + 20-day override, not the default 10
  });

  it("rewards on-time repayment and penalizes late repayment", async () => {
    await seedTreasury(ctx, 10000);
    const onTimeAgent = await makeAgent(ctx);
    const lateAgent = await makeAgent(ctx);

    const loan1 = await takeLoan(ctx, onTimeAgent, 100, SIMULATION_ID, 1);
    await repayLoan(ctx, onTimeAgent, loan1.id, SIMULATION_ID, loan1.dueDay);
    const freshOnTime = await ctx.repos.agents.findById(onTimeAgent.id);
    expect(freshOnTime!.reputation.score).toBeGreaterThan(STARTING_REPUTATION);

    const loan2 = await takeLoan(ctx, lateAgent, 100, SIMULATION_ID, 1);
    await repayLoan(ctx, lateAgent, loan2.id, SIMULATION_ID, loan2.dueDay + 1);
    const freshLate = await ctx.repos.agents.findById(lateAgent.id);
    expect(freshLate!.reputation.score).toBeLessThan(STARTING_REPUTATION);
  });
});
