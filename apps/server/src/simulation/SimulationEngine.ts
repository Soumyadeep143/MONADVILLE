import type { Personality, Simulation } from "@econforge/shared";
import {
  BUSINESS_WORKERS_REQUIRED,
  LOAN_DURATION_DAYS,
  LOAN_INTEREST_BPS,
  LOAN_MAX_PERCENT_BPS,
  PROMPT_VERSION,
  RULES_VERSION,
  SIMULATION_DURATION_DAYS,
  STARTING_CASH,
  STARTING_REPUTATION,
  TRANSACTION_TAX_BPS,
  WORKER_WAGE,
} from "@econforge/shared";
import type { EconomyContext } from "../economy/context.js";
import { recordEvent } from "../economy/index.js";
import { processDay } from "./DayProcessor.js";

export interface SimulationParticipant {
  userId: string;
  personality: Personality;
}

export async function createSimulation(
  ctx: EconomyContext,
  params: { name: string; durationDays?: number; participants: SimulationParticipant[] },
): Promise<Simulation> {
  const durationDays = params.durationDays ?? SIMULATION_DURATION_DAYS;
  const randomSeed = Math.floor(Math.random() * 1_000_000_000);

  const simulation = await ctx.repos.simulations.create({
    name: params.name,
    status: "CREATED",
    rulesVersion: RULES_VERSION,
    promptVersion: PROMPT_VERSION,
    randomSeed,
    durationDays,
    currentDay: 0,
    rules: {
      startingCash: STARTING_CASH,
      transactionTaxBps: TRANSACTION_TAX_BPS,
      workerWage: WORKER_WAGE,
      loanMaxPercentBps: LOAN_MAX_PERCENT_BPS,
      loanInterestBps: LOAN_INTEREST_BPS,
      loanDurationDays: LOAN_DURATION_DAYS,
      businessWorkers: BUSINESS_WORKERS_REQUIRED,
    },
    metrics: { gini: 0, averageWealth: STARTING_CASH, medianWealth: STARTING_CASH, top10WealthShare: 0, treasuryBalance: 0 },
    startedAt: null,
    completedAt: null,
  });

  for (const participant of params.participants) {
    const agent = await ctx.repos.agents.create({
      userId: participant.userId,
      simulationId: simulation.id,
      personality: participant.personality,
      economic: { cash: STARTING_CASH, outstandingDebt: 0, totalBorrowed: 0, totalRepaid: 0, totalInterestPaid: 0, totalIncome: 0, totalExpenses: 0 },
      state: { hunger: 0, employmentStatus: "UNEMPLOYED", employerId: null, propertyIds: [], businessIds: [] },
      reputation: { score: STARTING_REPUTATION, history: [] },
      activity: { score: 0, history: [] },
      statistics: { transactions: 0, theatreVisits: 0, loansTaken: 0, loansRepaid: 0, loansDefaulted: 0, businessesCreated: 0, businessesFailed: 0 },
      memory: [],
    });
    await ctx.ledger.registerAgent(simulation.id, agent.id, STARTING_CASH);
  }

  return simulation;
}

export async function startSimulation(ctx: EconomyContext, simulationId: string): Promise<Simulation> {
  const simulation = await ctx.repos.simulations.findById(simulationId);
  if (!simulation) throw new Error("Simulation not found");
  if (simulation.status !== "CREATED") throw new Error(`Cannot start a simulation in status ${simulation.status}`);
  const updated = await ctx.repos.simulations.update(simulationId, { status: "RUNNING", startedAt: new Date().toISOString() });
  await recordEvent(ctx, { simulationId, gameDay: 0, type: "DAY_STARTED", agentIds: [], message: "Simulation started" });
  return updated;
}

export async function pauseSimulation(ctx: EconomyContext, simulationId: string): Promise<Simulation> {
  return ctx.repos.simulations.update(simulationId, { status: "PAUSED" });
}

export async function resumeSimulation(ctx: EconomyContext, simulationId: string): Promise<Simulation> {
  return ctx.repos.simulations.update(simulationId, { status: "RUNNING" });
}

export async function stopSimulation(ctx: EconomyContext, simulationId: string): Promise<Simulation> {
  const updated = await ctx.repos.simulations.update(simulationId, { status: "COMPLETED", completedAt: new Date().toISOString() });
  await recordEvent(ctx, { simulationId, gameDay: updated.currentDay, type: "SIMULATION_COMPLETE", agentIds: [], message: "Simulation stopped early" });
  return updated;
}

/** Advances exactly one day; marks COMPLETED once durationDays is reached. */
export async function runOneDay(ctx: EconomyContext, simulationId: string): Promise<Simulation> {
  const simulation = await ctx.repos.simulations.findById(simulationId);
  if (!simulation) throw new Error("Simulation not found");
  if (simulation.status !== "RUNNING") throw new Error(`Simulation is not running (status: ${simulation.status})`);

  const updated = await processDay(ctx, simulation);

  if (updated.currentDay >= updated.durationDays) {
    const completed = await ctx.repos.simulations.update(simulationId, { status: "COMPLETED", completedAt: new Date().toISOString() });
    await recordEvent(ctx, {
      simulationId,
      gameDay: completed.currentDay,
      type: "SIMULATION_COMPLETE",
      agentIds: [],
      message: `Simulation completed after ${completed.currentDay} days`,
    });
    return completed;
  }

  return updated;
}

/** Runs every remaining day synchronously — used by the headless script and admin/testing flows. */
export async function runToCompletion(ctx: EconomyContext, simulationId: string): Promise<Simulation> {
  let simulation = await ctx.repos.simulations.findById(simulationId);
  if (!simulation) throw new Error("Simulation not found");
  while (simulation.status === "RUNNING" && simulation.currentDay < simulation.durationDays) {
    simulation = await runOneDay(ctx, simulationId);
  }
  return simulation;
}
