// Controlled-experiment runner — prd.md §22 / roadmap.md Phase 9.
//
// Runs a battery of scenarios that each hold everything constant (rules,
// agent count, duration, and — critically — the simulation's random seed,
// so shocks and any seeded tie-breaking land identically) except the one
// dimension being compared: decision policy, population shape, or a rules
// override. Personality-driven scenarios share one seeded heterogeneous
// population so "agent 7" has the same profile across every scenario that
// uses it, isolating the actual variable under test.
//
//   npm run experiment
//   AGENT_COUNT=30 DURATION_DAYS=20 npm run experiment

import { randomUUID } from "node:crypto";
import type { DecisionPolicy, Personality, SimulationRules } from "@econforge/shared";
import { createInMemoryRepositories } from "../apps/server/src/persistence/memory/index.js";
import { InMemoryLedgerService } from "../apps/server/src/blockchain/InMemoryLedgerService.js";
import type { EconomyContext } from "../apps/server/src/economy/context.js";
import * as SimulationEngine from "../apps/server/src/simulation/SimulationEngine.js";
import { computeFullAnalytics } from "../apps/server/src/analytics/index.js";
import { homogeneousPopulation, heterogeneousPopulation, skewedPopulation } from "../apps/server/src/simulation/populations.js";

const AGENT_COUNT = Number(process.env.AGENT_COUNT ?? 20);
const DURATION_DAYS = Number(process.env.DURATION_DAYS ?? 30);
const POPULATION_SEED = 1;
const SIMULATION_SEED = 42;

interface Scenario {
  name: string;
  decisionPolicy: DecisionPolicy;
  personalities: Personality[];
  rulesOverride?: Partial<SimulationRules>;
}

const heterogeneous = heterogeneousPopulation(AGENT_COUNT, POPULATION_SEED);
const neutral: Personality = { risk: 50, spending: 50, ethics: 50, confidence: 50, fomo: 50 };

const scenarios: Scenario[] = [
  // prd.md §22 "recommended baseline" — same population, only the decision policy varies.
  { name: "Rational baseline", decisionPolicy: "RATIONAL", personalities: heterogeneous },
  { name: "Random baseline", decisionPolicy: "RANDOM", personalities: heterogeneous },
  { name: "Personality-driven (heterogeneous)", decisionPolicy: "PERSONALITY", personalities: heterogeneous },

  // roadmap.md Phase 9 "experiments" — population shape.
  { name: "Homogeneous population", decisionPolicy: "PERSONALITY", personalities: homogeneousPopulation(AGENT_COUNT, neutral) },
  { name: "High-risk population", decisionPolicy: "PERSONALITY", personalities: skewedPopulation(AGENT_COUNT, POPULATION_SEED, "risk", 90) },
  { name: "High-FOMO population", decisionPolicy: "PERSONALITY", personalities: skewedPopulation(AGENT_COUNT, POPULATION_SEED, "fomo", 90) },

  // roadmap.md Phase 9 "experiments" — rules.
  { name: "Low tax (1%)", decisionPolicy: "PERSONALITY", personalities: heterogeneous, rulesOverride: { transactionTaxBps: 100 } },
  { name: "High tax (8%)", decisionPolicy: "PERSONALITY", personalities: heterogeneous, rulesOverride: { transactionTaxBps: 800 } },
  { name: "Loose loan policy", decisionPolicy: "PERSONALITY", personalities: heterogeneous, rulesOverride: { loanMaxPercentBps: 8000, loanInterestBps: 500 } },
  { name: "Strict loan policy", decisionPolicy: "PERSONALITY", personalities: heterogeneous, rulesOverride: { loanMaxPercentBps: 2500, loanInterestBps: 2000 } },
];

async function runScenario(scenario: Scenario) {
  const ctx: EconomyContext = {
    repos: createInMemoryRepositories(),
    ledger: new InMemoryLedgerService(),
    rules: { startingCash: 1000, transactionTaxBps: 200, workerWage: 20, loanMaxPercentBps: 5000, loanInterestBps: 1000, loanDurationDays: 10, businessWorkers: 2 },
  };

  const participants = scenario.personalities.map((personality) => ({ userId: randomUUID(), personality }));
  const simulation = await SimulationEngine.createSimulation(ctx, {
    name: scenario.name,
    durationDays: DURATION_DAYS,
    participants,
    decisionPolicy: scenario.decisionPolicy,
    rulesOverride: scenario.rulesOverride,
    seed: SIMULATION_SEED,
  });
  await SimulationEngine.startSimulation(ctx, simulation.id);
  await SimulationEngine.runToCompletion(ctx, simulation.id);

  const analytics = await computeFullAnalytics(ctx, simulation.id);
  return { scenario: scenario.name, policy: scenario.decisionPolicy, analytics };
}

async function main() {
  console.log(`Running ${scenarios.length} scenarios — ${AGENT_COUNT} agents x ${DURATION_DAYS} days each, seed ${SIMULATION_SEED} (population seed ${POPULATION_SEED}).\n`);

  const rows: Record<string, string | number>[] = [];
  for (const scenario of scenarios) {
    process.stdout.write(`  ${scenario.name}... `);
    const started = Date.now();
    const { analytics } = await runScenario(scenario);
    console.log(`done (${((Date.now() - started) / 1000).toFixed(1)}s)`);

    rows.push({
      Scenario: scenario.name,
      Policy: scenario.decisionPolicy,
      "Mean wealth": analytics.wealth.average,
      "Median wealth": analytics.wealth.median,
      Gini: analytics.wealth.gini,
      "Top 10%": analytics.wealth.top10Share,
      "Default rate": analytics.finance.loansIssued === 0 ? 0 : Math.round((analytics.finance.defaults / analytics.finance.loansIssued) * 1000) / 1000,
      Businesses: analytics.business.created,
      "Survival rate": analytics.business.survivalRate,
      "Avg wage": analytics.labor.averageWage,
      "Tx volume": analytics.finance.transactionVolume,
      Treasury: analytics.finance.treasuryBalance,
    });
  }

  console.log("\n" + "=".repeat(80));
  console.log("prd.md §22 comparison — mean/median wealth, Gini, top-10% share, default");
  console.log("rate, business count/survival, average wage, transaction volume, treasury.");
  console.log("=".repeat(80) + "\n");
  console.table(rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
