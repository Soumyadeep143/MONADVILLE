// flow.md §15 replay flow: simulationId + randomSeed + rulesVersion +
// promptVersion + stored decisions -> replay engine -> compare state
// snapshots -> detect divergence.
//
// Only PERSONALITY/RANDOM/RATIONAL policies are byte-for-byte reproducible
// given the same seed (README.md / prd.md §22) — LLM calls a live model and
// is documented as non-deterministic by design, so replaying it would just
// produce a second, unrelated run rather than a divergence check. Replay
// therefore re-creates a fresh simulation from the original's recorded
// seed/rules/policy/population and re-runs it to completion, then diffs the
// two simulations' final analytics. Agent personality and starting economics
// are fixed at creation time (economy/state/etc. are what mutate over a
// run), so the original agents' stored `personality` is sufficient to
// reconstruct the exact starting population without needing a separate
// day-0 snapshot.
import type { EconomyContext } from "../economy/context.js";
import { computeFullAnalytics, type FullAnalytics } from "../analytics/index.js";
import * as SimulationEngine from "./SimulationEngine.js";
import { ActionError } from "../economy/errors.js";

const REPLAYABLE_POLICIES = new Set(["PERSONALITY", "RANDOM", "RATIONAL"]);

export interface ReplayResult {
  originalSimulationId: string;
  replaySimulationId: string;
  decisionPolicy: string;
  seed: number;
  matches: boolean;
  divergences: string[];
  original: FullAnalytics;
  replay: FullAnalytics;
}

function compareField(divergences: string[], label: string, a: number, b: number): void {
  if (Math.abs(a - b) > 0.01) divergences.push(`${label}: original=${a} replay=${b}`);
}

export async function replaySimulation(ctx: EconomyContext, simulationId: string): Promise<ReplayResult> {
  const original = await ctx.repos.simulations.findById(simulationId);
  if (!original) throw new ActionError("NOT_FOUND", `Simulation ${simulationId} not found`);
  if (original.status !== "COMPLETED") {
    throw new ActionError("INVALID_ACTION", `Simulation ${simulationId} is ${original.status}, not COMPLETED — only a finished run can be replayed`);
  }
  if (!REPLAYABLE_POLICIES.has(original.decisionPolicy)) {
    throw new ActionError(
      "INVALID_ACTION",
      `decisionPolicy=${original.decisionPolicy} calls a live LLM and is not deterministic — replay only supports PERSONALITY/RANDOM/RATIONAL (flow.md §15)`,
    );
  }

  const originalAgents = await ctx.repos.agents.findBySimulation(simulationId);
  const replay = await SimulationEngine.createSimulation(ctx, {
    name: `${original.name} [replay]`,
    durationDays: original.durationDays,
    participants: originalAgents.map((a) => ({ userId: a.userId, personality: a.personality })),
    decisionPolicy: original.decisionPolicy,
    rulesOverride: original.rules,
    seed: original.randomSeed,
  });
  await SimulationEngine.startSimulation(ctx, replay.id);
  const finished = await SimulationEngine.runToCompletion(ctx, replay.id);

  const [originalAnalytics, replayAnalytics] = await Promise.all([
    computeFullAnalytics(ctx, simulationId),
    computeFullAnalytics(ctx, finished.id),
  ]);

  const divergences: string[] = [];
  compareField(divergences, "wealth.gini", originalAnalytics.wealth.gini, replayAnalytics.wealth.gini);
  compareField(divergences, "wealth.average", originalAnalytics.wealth.average, replayAnalytics.wealth.average);
  compareField(divergences, "wealth.median", originalAnalytics.wealth.median, replayAnalytics.wealth.median);
  compareField(divergences, "business.created", originalAnalytics.business.created, replayAnalytics.business.created);
  compareField(divergences, "business.failed", originalAnalytics.business.failed, replayAnalytics.business.failed);
  compareField(divergences, "finance.defaults", originalAnalytics.finance.defaults, replayAnalytics.finance.defaults);
  compareField(divergences, "finance.treasuryBalance", originalAnalytics.finance.treasuryBalance, replayAnalytics.finance.treasuryBalance);
  compareField(divergences, "finance.transactionVolume", originalAnalytics.finance.transactionVolume, replayAnalytics.finance.transactionVolume);

  return {
    originalSimulationId: simulationId,
    replaySimulationId: finished.id,
    decisionPolicy: original.decisionPolicy,
    seed: original.randomSeed,
    matches: divergences.length === 0,
    divergences,
    original: originalAnalytics,
    replay: replayAnalytics,
  };
}
