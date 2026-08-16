import { netWorth } from "@econforge/shared";
import type { SimulationMetrics } from "@econforge/shared";
import type { EconomyContext } from "../economy/context.js";
import { average, median, top10WealthShare, gini } from "./wealth.js";

async function wealthValues(ctx: EconomyContext, simulationId: string): Promise<number[]> {
  const agents = await ctx.repos.agents.findBySimulation(simulationId);
  const properties = await ctx.repos.properties.findBySimulation(simulationId);
  return agents.map((agent) => {
    const marked = properties.filter((p) => p.ownerAgentId === agent.id).reduce((sum, p) => sum + p.marketValue, 0);
    return netWorth(agent, marked);
  });
}

export async function computeMetrics(ctx: EconomyContext, simulationId: string): Promise<SimulationMetrics> {
  const values = await wealthValues(ctx, simulationId);
  const treasuryBalance = await ctx.ledger.getTreasuryBalance(simulationId);
  return {
    gini: Math.round(gini(values) * 1000) / 1000,
    averageWealth: Math.round(average(values) * 100) / 100,
    medianWealth: Math.round(median(values) * 100) / 100,
    top10WealthShare: Math.round(top10WealthShare(values) * 1000) / 1000,
    treasuryBalance,
  };
}

export interface FullAnalytics {
  wealth: { average: number; median: number; gini: number; top10Share: number };
  business: { created: number; failed: number; survivalRate: number };
  labor: { averageWage: number; employmentRate: number };
  finance: { loansIssued: number; defaults: number; treasuryBalance: number; transactionVolume: number };
  activity: { average: number; highest: number };
}

/** api.md §12 shape — the final results a completed simulation reports. */
export async function computeFullAnalytics(ctx: EconomyContext, simulationId: string): Promise<FullAnalytics> {
  const agents = await ctx.repos.agents.findBySimulation(simulationId);
  const businesses = await ctx.repos.businesses.findBySimulation(simulationId);
  const loans = await ctx.repos.loans.findBySimulation(simulationId);
  const transactions = await ctx.repos.transactions.findBySimulation(simulationId);
  const values = await wealthValues(ctx, simulationId);

  const businessesCreated = businesses.length;
  const businessesFailed = businesses.filter((b) => b.status === "FAILED").length;

  const wages = businesses.flatMap((b) => b.employees.map((e) => e.wage));
  const employed = agents.filter((a) => a.state.employmentStatus === "EMPLOYED").length;

  const activityScores = agents.map((a) => a.activity.score);

  return {
    wealth: {
      average: Math.round(average(values) * 100) / 100,
      median: Math.round(median(values) * 100) / 100,
      gini: Math.round(gini(values) * 1000) / 1000,
      top10Share: Math.round(top10WealthShare(values) * 1000) / 1000,
    },
    business: {
      created: businessesCreated,
      failed: businessesFailed,
      survivalRate: businessesCreated === 0 ? 0 : Math.round(((businessesCreated - businessesFailed) / businessesCreated) * 1000) / 1000,
    },
    labor: {
      averageWage: Math.round(average(wages) * 100) / 100,
      employmentRate: agents.length === 0 ? 0 : Math.round((employed / agents.length) * 1000) / 1000,
    },
    finance: {
      loansIssued: loans.length,
      defaults: loans.filter((l) => l.status === "DEFAULTED").length,
      treasuryBalance: await ctx.ledger.getTreasuryBalance(simulationId),
      transactionVolume: transactions.filter((t) => t.blockchain.status === "CONFIRMED").length,
    },
    activity: {
      average: Math.round(average(activityScores) * 100) / 100,
      highest: activityScores.length === 0 ? 0 : Math.max(...activityScores),
    },
  };
}
