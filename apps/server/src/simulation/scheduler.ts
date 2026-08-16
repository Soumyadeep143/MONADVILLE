import { getRepositories } from "../persistence/index.js";
import { getLedgerService } from "../blockchain/index.js";
import { runOneDay } from "./SimulationEngine.js";

const TICK_INTERVAL_MS = 4000;
const inFlight = new Set<string>();

/**
 * Advances every RUNNING simulation by one day on a fixed interval, so
 * simulations play out live in the background without the frontend having
 * to drive each day itself. Single-process, in-memory lock per simulation
 * so a slow day (LLM latency) never overlaps with the next tick for the
 * same simulation.
 */
export function startScheduler(): void {
  setInterval(async () => {
    const repos = await getRepositories();
    const ledger = getLedgerService();
    const simulations = await repos.simulations.list();

    for (const simulation of simulations) {
      if (simulation.status !== "RUNNING" || inFlight.has(simulation.id)) continue;
      inFlight.add(simulation.id);
      runOneDay({ repos, ledger }, simulation.id)
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`[scheduler] day advance failed for simulation ${simulation.id}:`, err);
        })
        .finally(() => inFlight.delete(simulation.id));
    }
  }, TICK_INTERVAL_MS);
}
