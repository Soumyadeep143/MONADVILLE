import { describe, it, expect, beforeEach } from "vitest";
import type { Personality } from "@econforge/shared";
import { DEFAULT_RULES } from "@econforge/shared";
import { createInMemoryRepositories } from "../persistence/memory/index.js";
import { InMemoryLedgerService } from "../blockchain/InMemoryLedgerService.js";
import type { EconomyContext } from "../economy/context.js";
import * as SimulationEngine from "../simulation/SimulationEngine.js";
import { replaySimulation } from "../simulation/replay.js";

const PERSONALITY: Personality = { risk: 50, spending: 50, ethics: 50, confidence: 50, fomo: 50 };

async function runDeterministicSimulation(ctx: EconomyContext, policy: "PERSONALITY" | "RANDOM" | "RATIONAL") {
  const sim = await SimulationEngine.createSimulation(ctx, {
    name: "replay-source",
    durationDays: 5,
    participants: Array.from({ length: 6 }, (_, i) => ({ userId: `user${i}`, personality: PERSONALITY })),
    decisionPolicy: policy,
    seed: 123,
  });
  await SimulationEngine.startSimulation(ctx, sim.id);
  return SimulationEngine.runToCompletion(ctx, sim.id);
}

describe("seeded replay (flow.md §15)", () => {
  let ctx: EconomyContext;

  beforeEach(() => {
    const repos = createInMemoryRepositories();
    ctx = { repos, ledger: new InMemoryLedgerService(), rules: DEFAULT_RULES };
  });

  it("reproduces identical final analytics for a deterministic (RATIONAL) policy given the same seed", async () => {
    const original = await runDeterministicSimulation(ctx, "RATIONAL");

    const result = await replaySimulation(ctx, original.id);

    expect(result.matches).toBe(true);
    expect(result.divergences).toEqual([]);
    expect(result.original).toEqual(result.replay);
  });

  it("reproduces identical final analytics for RANDOM and PERSONALITY policies too", async () => {
    for (const policy of ["RANDOM", "PERSONALITY"] as const) {
      const original = await runDeterministicSimulation(ctx, policy);
      const result = await replaySimulation(ctx, original.id);
      expect(result.matches).toBe(true);
      expect(result.divergences).toEqual([]);
    }
  });

  it("refuses to replay a simulation that used the (non-deterministic) LLM policy", async () => {
    // stopSimulation (not a real day-processed run) is enough here — the
    // rejection is a pure metadata check (status + decisionPolicy), so
    // there's no need to actually run days through the LLM policy (which
    // would mean a real, slow, flaky network call to Groq in a unit test).
    const sim = await SimulationEngine.createSimulation(ctx, {
      name: "llm-source",
      durationDays: 2,
      participants: [{ userId: "u1", personality: PERSONALITY }],
      decisionPolicy: "LLM",
      seed: 1,
    });
    await SimulationEngine.startSimulation(ctx, sim.id);
    const finished = await SimulationEngine.stopSimulation(ctx, sim.id);

    await expect(replaySimulation(ctx, finished.id)).rejects.toThrow(/not deterministic/);
  });

  it("refuses to replay a simulation that hasn't completed yet", async () => {
    const sim = await SimulationEngine.createSimulation(ctx, {
      name: "unfinished",
      durationDays: 5,
      participants: [{ userId: "u1", personality: PERSONALITY }],
      decisionPolicy: "RATIONAL",
      seed: 1,
    });

    await expect(replaySimulation(ctx, sim.id)).rejects.toThrow(/not COMPLETED/);
  });
});

describe("simulation lifecycle guards", () => {
  let ctx: EconomyContext;

  beforeEach(() => {
    ctx = { repos: createInMemoryRepositories(), ledger: new InMemoryLedgerService(), rules: DEFAULT_RULES };
  });

  it("rejects pausing a simulation that isn't RUNNING", async () => {
    const sim = await SimulationEngine.createSimulation(ctx, {
      name: "s",
      participants: [{ userId: "u1", personality: PERSONALITY }],
    });
    await expect(SimulationEngine.pauseSimulation(ctx, sim.id)).rejects.toThrow(/Cannot pause/);
  });

  it("allows resuming from FAILED as well as PAUSED", async () => {
    const sim = await SimulationEngine.createSimulation(ctx, {
      name: "s",
      participants: [{ userId: "u1", personality: PERSONALITY }],
    });
    await SimulationEngine.startSimulation(ctx, sim.id);
    await ctx.repos.simulations.update(sim.id, { status: "FAILED" });
    const resumed = await SimulationEngine.resumeSimulation(ctx, sim.id);
    expect(resumed.status).toBe("RUNNING");
  });

  it("rejects resuming a CREATED (never-started) simulation", async () => {
    const sim = await SimulationEngine.createSimulation(ctx, {
      name: "s",
      participants: [{ userId: "u1", personality: PERSONALITY }],
    });
    await expect(SimulationEngine.resumeSimulation(ctx, sim.id)).rejects.toThrow(/Cannot resume/);
  });
});
