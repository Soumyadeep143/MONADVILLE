import { DEFAULT_RULES } from "@econforge/shared";
import type { EconomyContext } from "../economy/context.js";
import { getRepositories } from "../persistence/index.js";
import { getLedgerService } from "../blockchain/index.js";

/**
 * Builds the per-request economy context. Pass the route's `simulationId`
 * whenever one exists — it fetches that simulation's own rules (so
 * experiment overrides like a custom tax rate actually apply); routes with
 * no simulation yet (list/create) fall back to DEFAULT_RULES, which is also
 * what the created simulation ends up with absent an explicit override.
 */
export async function getEconomyContext(simulationId?: string): Promise<EconomyContext> {
  const repos = await getRepositories();
  const ledger = getLedgerService();
  if (!simulationId) return { repos, ledger, rules: DEFAULT_RULES };
  const simulation = await repos.simulations.findById(simulationId);
  return { repos, ledger, rules: simulation?.rules ?? DEFAULT_RULES };
}
