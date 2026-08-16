import type { DecisionPolicy, Personality, Simulation, SimulationRules } from "@econforge/shared";
import { DEFAULT_RULES, PROMPT_VERSION, RULES_VERSION, SIMULATION_DURATION_DAYS, STARTING_CASH, STARTING_REPUTATION } from "@econforge/shared";
import type { EconomyContext } from "../economy/context.js";
import { recordEvent } from "../economy/index.js";
import { ActionError } from "../economy/errors.js";
import { processDay } from "./DayProcessor.js";

function requireSimulation(simulation: Simulation | null, simulationId: string): Simulation {
  if (!simulation) throw new ActionError("NOT_FOUND", `Simulation ${simulationId} not found`);
  return simulation;
}

/**
 * Thrown by runOneDay when another caller is already advancing the same
 * simulation. Distinct from a real failure — scheduler.ts must not treat it
 * as one (see the comment there).
 */
export class SimulationBusyError extends Error {}

// Process-wide mutual exclusion for runOneDay, keyed by simulationId. The
// background scheduler (scheduler.ts) ticks every few seconds and calls
// runOneDay on every RUNNING simulation — but runOneDay is also called
// directly by runToCompletion (headless script, replay.ts). A direct caller
// marks its simulation RUNNING and then drives it itself; without this
// lock, the scheduler's own tick can grab that same now-RUNNING simulation
// mid-flight and call runOneDay concurrently, double-advancing days (this
// was caught for real: a replay run against real Mongo latency reliably
// spans multiple scheduler ticks, and the two racing runOneDay calls
// produced visibly wrong results — more businesses created than the
// original run, agent cash driven to 0). One lock shared by every call site
// closes the race for all of them at once.
const inFlight = new Set<string>();

export interface SimulationParticipant {
  userId: string;
  personality: Personality;
}

export async function createSimulation(
  ctx: EconomyContext,
  params: {
    name: string;
    durationDays?: number;
    participants: SimulationParticipant[];
    decisionPolicy?: DecisionPolicy;
    rulesOverride?: Partial<SimulationRules>;
    /** Pin the seed instead of randomizing it — prd.md §22 "controlled random seed" for repeatable experiments. */
    seed?: number;
  },
): Promise<Simulation> {
  const durationDays = params.durationDays ?? SIMULATION_DURATION_DAYS;
  const randomSeed = params.seed ?? Math.floor(Math.random() * 1_000_000_000);
  const rules: SimulationRules = { ...DEFAULT_RULES, ...params.rulesOverride };

  const simulation = await ctx.repos.simulations.create({
    name: params.name,
    status: "CREATED",
    rulesVersion: RULES_VERSION,
    promptVersion: PROMPT_VERSION,
    randomSeed,
    durationDays,
    currentDay: 0,
    rules,
    decisionPolicy: params.decisionPolicy ?? "LLM",
    metrics: { gini: 0, averageWealth: rules.startingCash, medianWealth: rules.startingCash, top10WealthShare: 0, treasuryBalance: 0 },
    startedAt: null,
    completedAt: null,
  });

  for (const participant of params.participants) {
    const agent = await ctx.repos.agents.create({
      userId: participant.userId,
      simulationId: simulation.id,
      personality: participant.personality,
      economic: { cash: rules.startingCash, outstandingDebt: 0, totalBorrowed: 0, totalRepaid: 0, totalInterestPaid: 0, totalIncome: 0, totalExpenses: 0 },
      state: { hunger: 0, employmentStatus: "UNEMPLOYED", employerId: null, propertyIds: [], businessIds: [] },
      reputation: { score: STARTING_REPUTATION, history: [] },
      activity: { score: 0, history: [] },
      statistics: { transactions: 0, theatreVisits: 0, loansTaken: 0, loansRepaid: 0, loansDefaulted: 0, businessesCreated: 0, businessesFailed: 0 },
      memory: [],
    });
    await ctx.ledger.registerAgent(simulation.id, agent.id, rules.startingCash);
  }

  return simulation;
}

export async function startSimulation(ctx: EconomyContext, simulationId: string): Promise<Simulation> {
  const simulation = requireSimulation(await ctx.repos.simulations.findById(simulationId), simulationId);
  if (simulation.status !== "CREATED") {
    throw new ActionError("INVALID_ACTION", `Cannot start a simulation in status ${simulation.status}`);
  }
  const updated = await ctx.repos.simulations.update(simulationId, { status: "RUNNING", startedAt: new Date().toISOString() });
  await recordEvent(ctx, { simulationId, gameDay: 0, type: "DAY_STARTED", agentIds: [], message: "Simulation started" });
  return updated;
}

export async function pauseSimulation(ctx: EconomyContext, simulationId: string): Promise<Simulation> {
  const simulation = requireSimulation(await ctx.repos.simulations.findById(simulationId), simulationId);
  if (simulation.status !== "RUNNING") {
    throw new ActionError("INVALID_ACTION", `Cannot pause a simulation in status ${simulation.status}`);
  }
  return ctx.repos.simulations.update(simulationId, { status: "PAUSED" });
}

/** Also the recovery path out of FAILED (flow.md §16: a persistence-layer error pauses the sim as FAILED; resuming retries the next day). */
export async function resumeSimulation(ctx: EconomyContext, simulationId: string): Promise<Simulation> {
  const simulation = requireSimulation(await ctx.repos.simulations.findById(simulationId), simulationId);
  if (simulation.status !== "PAUSED" && simulation.status !== "FAILED") {
    throw new ActionError("INVALID_ACTION", `Cannot resume a simulation in status ${simulation.status}`);
  }
  return ctx.repos.simulations.update(simulationId, { status: "RUNNING" });
}

export async function stopSimulation(ctx: EconomyContext, simulationId: string): Promise<Simulation> {
  const simulation = requireSimulation(await ctx.repos.simulations.findById(simulationId), simulationId);
  if (simulation.status !== "RUNNING" && simulation.status !== "PAUSED" && simulation.status !== "FAILED") {
    throw new ActionError("INVALID_ACTION", `Cannot stop a simulation in status ${simulation.status}`);
  }
  const updated = await ctx.repos.simulations.update(simulationId, { status: "COMPLETED", completedAt: new Date().toISOString() });
  await recordEvent(ctx, { simulationId, gameDay: updated.currentDay, type: "SIMULATION_COMPLETE", agentIds: [], message: "Simulation stopped early" });
  return updated;
}

/** Advances exactly one day; marks COMPLETED once durationDays is reached. */
export async function runOneDay(ctx: EconomyContext, simulationId: string): Promise<Simulation> {
  if (inFlight.has(simulationId)) {
    throw new SimulationBusyError(`Simulation ${simulationId} is already being advanced by another caller`);
  }
  inFlight.add(simulationId);
  try {
    const simulation = requireSimulation(await ctx.repos.simulations.findById(simulationId), simulationId);
    if (simulation.status !== "RUNNING") throw new ActionError("INVALID_ACTION", `Simulation is not running (status: ${simulation.status})`);

    // Self-correcting: use THIS simulation's own rules regardless of what the
    // caller's ctx carried — the scheduler shares one ctx across many
    // simulations that can each have different (experiment) rules.
    const rulesAwareCtx: EconomyContext = { ...ctx, rules: simulation.rules };
    const updated = await processDay(rulesAwareCtx, simulation);

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
  } finally {
    inFlight.delete(simulationId);
  }
}

/** Runs every remaining day synchronously — used by the headless script and admin/testing flows. */
export async function runToCompletion(ctx: EconomyContext, simulationId: string): Promise<Simulation> {
  let simulation = requireSimulation(await ctx.repos.simulations.findById(simulationId), simulationId);
  while (simulation.status === "RUNNING" && simulation.currentDay < simulation.durationDays) {
    simulation = await runOneDay(ctx, simulationId);
  }
  return simulation;
}
