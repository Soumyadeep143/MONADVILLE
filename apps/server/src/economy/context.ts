import type { SimulationRules } from "@econforge/shared";
import type { Repositories } from "../persistence/index.js";
import type { LedgerService } from "../blockchain/index.js";

/**
 * Everything an economy operation needs: the persistence seam, the ledger
 * seam, and the active simulation's rules. `rules` makes tax rate, wage,
 * loan terms, and worker requirements per-simulation instead of hardcoded
 * global constants — required for prd.md §22's "tax-rate comparison" /
 * "loan-policy comparison" experiments. Callers build this once per
 * simulation (or per day-processing pass) from `simulation.rules`; the
 * shared constants remain the *defaults* a new simulation starts from, not
 * something economy code reads directly.
 */
export interface EconomyContext {
  repos: Repositories;
  ledger: LedgerService;
  rules: SimulationRules;
}
