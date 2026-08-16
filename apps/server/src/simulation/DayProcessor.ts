import type { Simulation } from "@econforge/shared";
import { DECISION_CYCLES_PER_DAY } from "@econforge/shared";
import type { EconomyContext } from "../economy/context.js";
import * as economy from "../economy/index.js";
import { prepareAgentDecision, applyAgentDecision } from "../agents/runner.js";
import { computeMetrics } from "../analytics/index.js";
import { mapWithConcurrency } from "./concurrency.js";
import { env } from "../config/env.js";

function buildMarketSummary(businessCounts: Record<string, number>, treasuryBalance: number, shockMessage: string): string {
  const parts = [
    `Treasury balance: ${treasuryBalance}.`,
    `Active businesses — farms: ${businessCounts.FARM ?? 0}, restaurants: ${businessCounts.RESTAURANT ?? 0}, theatres: ${businessCounts.THEATRE ?? 0}.`,
  ];
  if (shockMessage) parts.push(shockMessage);
  return parts.join(" ");
}

/** One full game day — flow.md §4. Deterministic steps first, then each agent's decision, in a fixed order for reproducibility. */
export async function processDay(ctx: EconomyContext, simulation: Simulation): Promise<Simulation> {
  const gameDay = simulation.currentDay + 1;
  const simulationId = simulation.id;

  await economy.recordEvent(ctx, { simulationId, gameDay, type: "DAY_STARTED", agentIds: [], message: `Day ${gameDay} started` });

  const shock = economy.getActiveShock(simulation.randomSeed, gameDay);
  const shockMessage = economy.shockMessage(shock);
  if (shock) {
    await economy.recordEvent(ctx, { simulationId, gameDay, type: "SHOCK", agentIds: [], message: shockMessage, metadata: { shock } });
  }

  // Deterministic needs/production/wages/loan-maturity steps (prd.md §16 steps 1-5).
  await economy.applyHungerTick(ctx, simulationId);
  await economy.autoFillVacancies(ctx, simulationId, gameDay);
  await economy.processDailyProduction(ctx, simulationId, economy.foodOutputMultiplier(shock));
  await economy.payWages(ctx, simulationId, gameDay);
  await economy.processLoanMaturities(ctx, simulationId, gameDay);
  // Bertrand-style undercutting / monopoly drift (prd.md §20) — deterministic,
  // runs before agents see today's prices, never an agent-chosen action.
  await economy.adjustPrices(ctx, simulationId);

  const businesses = await ctx.repos.businesses.findBySimulation(simulationId, { status: "ACTIVE" });
  const businessCounts = businesses.reduce<Record<string, number>>((acc, b) => {
    acc[b.type] = (acc[b.type] ?? 0) + 1;
    return acc;
  }, {});
  const treasuryBalance = await ctx.ledger.getTreasuryBalance(simulationId);
  const marketSummary = buildMarketSummary(businessCounts, treasuryBalance, shockMessage);

  // Agent decisions: a "day" is a simulation tick, not a one-decision-per-day
  // throttle. Each agent runs DECISION_CYCLES_PER_DAY full decide->execute->
  // complete cycles this tick, round-robin across agents (all agents' cycle
  // 1, then all agents' cycle 2, ...) rather than one agent exhausting all
  // its cycles before the next agent gets a turn.
  //
  // Within one cycle, the "decide" half (candidate generation + LLM/fallback
  // pick) is read-only, so it's fanned out across agents with bounded
  // concurrency — that round trip is what actually dominates a cycle's
  // wall-clock time, not local computation, and Groq is fast enough that
  // batching many of these at once is the real throughput lever. The
  // "execute" half mutates shared state (business inventory, treasury, ...)
  // and always runs strictly sequentially in a fixed order afterward, so an
  // agent never has two decisions in flight and a given seed+day stays
  // reproducible (flow.md §15 replay) regardless of network timing.
  // Sorted by userId, not the DB-assigned agent.id: execution order must be
  // stable across runs sharing a seed (flow.md §15 replay) even though a
  // fresh/replayed run's agents get entirely different surrogate ids.
  const agentIds = (await ctx.repos.agents.findBySimulation(simulationId))
    .slice()
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .map((a) => a.id);
  for (let cycle = 0; cycle < DECISION_CYCLES_PER_DAY; cycle++) {
    const agents = (await Promise.all(agentIds.map((id) => ctx.repos.agents.findById(id)))).filter((a): a is NonNullable<typeof a> => a !== null);

    const prepared = await mapWithConcurrency(agents, env.DECISION_CONCURRENCY, (agent) =>
      prepareAgentDecision(ctx, agent, simulationId, gameDay, simulation.randomSeed, marketSummary, simulation.decisionPolicy),
    );

    for (const decision of prepared) {
      await applyAgentDecision(ctx, decision, simulationId, gameDay);
    }
  }

  const metrics = await computeMetrics(ctx, simulationId);
  const updated = await ctx.repos.simulations.update(simulationId, { currentDay: gameDay, metrics });

  await economy.recordEvent(ctx, { simulationId, gameDay, type: "DAY_ENDED", agentIds: [], message: `Day ${gameDay} ended` });

  return updated;
}
