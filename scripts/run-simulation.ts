// Headless smoke test — prd.md §23 acceptance criteria, run without any
// external services (in-memory persistence + in-memory ledger by default).
//
//   npm run simulate            # 20 agents, 30 days
//   AGENT_COUNT=50 npm run simulate

import { randomUUID } from "node:crypto";
import type { Personality } from "@econforge/shared";
import { STARTING_CASH } from "@econforge/shared";
import { createInMemoryRepositories } from "../apps/server/src/persistence/memory/index.js";
import { InMemoryLedgerService } from "../apps/server/src/blockchain/InMemoryLedgerService.js";
import type { EconomyContext } from "../apps/server/src/economy/context.js";
import * as SimulationEngine from "../apps/server/src/simulation/SimulationEngine.js";
import { computeFullAnalytics } from "../apps/server/src/analytics/index.js";

const AGENT_COUNT = Number(process.env.AGENT_COUNT ?? 20);
const DURATION_DAYS = Number(process.env.DURATION_DAYS ?? 30);

function randomPersonality(): Personality {
  const rnd = () => Math.round(Math.random() * 100);
  return { risk: rnd(), spending: rnd(), ethics: rnd(), confidence: rnd(), fomo: rnd() };
}

async function main() {
  const ctx: EconomyContext = { repos: createInMemoryRepositories(), ledger: new InMemoryLedgerService() };

  const participants = Array.from({ length: AGENT_COUNT }, () => ({ userId: randomUUID(), personality: randomPersonality() }));
  const simulation0 = await SimulationEngine.createSimulation(ctx, { name: "Headless smoke test", durationDays: DURATION_DAYS, participants });
  await SimulationEngine.startSimulation(ctx, simulation0.id);

  console.log(`Simulation ${simulation0.id}: ${AGENT_COUNT} agents, ${DURATION_DAYS} days, seed ${simulation0.randomSeed}, Groq ${process.env.GROQ_API_KEY ? "enabled" : "disabled (fallback policy only)"}`);

  const started = Date.now();
  const final = await SimulationEngine.runToCompletion(ctx, simulation0.id);
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`Completed in ${elapsedSec}s. Status: ${final.status}, day ${final.currentDay}/${final.durationDays}`);
  console.log("Final metrics:", final.metrics);

  // ---- prd.md §23 acceptance criteria -------------------------------------
  const failures: string[] = [];
  const check = (label: string, ok: boolean) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${label}`);
    if (!ok) failures.push(label);
  };

  check(`${AGENT_COUNT} agents completed ${DURATION_DAYS} days without manual intervention`, final.status === "COMPLETED" && final.currentDay === DURATION_DAYS);

  const treasuryBalance = await ctx.ledger.getTreasuryBalance(simulation0.id);
  check("Treasury never negative", treasuryBalance >= 0);

  const agents = await ctx.repos.agents.findBySimulation(simulation0.id);
  check("No agent debt is negative", agents.every((a) => a.economic.outstandingDebt >= 0));

  const businesses = await ctx.repos.businesses.findBySimulation(simulation0.id);
  check("No ACTIVE business has fewer than 2 employees", businesses.every((b) => b.status !== "ACTIVE" || b.employees.length >= 2));

  let totalAgentBalance = 0;
  for (const agent of agents) totalAgentBalance += await ctx.ledger.getBalance(simulation0.id, agent.id);
  const expectedMoneySupply = AGENT_COUNT * STARTING_CASH;
  const actualMoneySupply = Math.round((totalAgentBalance + treasuryBalance) * 100) / 100;
  check(`Money conserved (agents + treasury == ${expectedMoneySupply})`, Math.abs(actualMoneySupply - expectedMoneySupply) < 0.01);

  let analyticsOk = true;
  try {
    const analytics = await computeFullAnalytics(ctx, simulation0.id);
    analyticsOk = analytics.wealth.gini >= 0 && analytics.wealth.gini <= 1;
  } catch {
    analyticsOk = false;
  }
  check("Final analytics calculate successfully", analyticsOk);

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll acceptance checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
