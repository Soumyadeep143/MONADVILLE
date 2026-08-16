import { DEFAULT_RULES } from "@econforge/shared";
import { getRepositories } from "../persistence/index.js";
import { getLedgerService } from "../blockchain/index.js";
import { runOneDay, SimulationBusyError } from "./SimulationEngine.js";

const TICK_INTERVAL_MS = 4000;
// Cheap pre-check only, to skip re-issuing a call for a tick already known
// to be in flight from a previous tick. The real cross-caller lock lives in
// SimulationEngine.runOneDay itself (also guards against e.g. a replay
// driving this same simulation directly, outside the scheduler entirely).
const tickInFlight = new Set<string>();

/**
 * Advances every RUNNING simulation by one day on a fixed interval, so
 * simulations play out live in the background without the frontend having
 * to drive each day itself.
 */
export function startScheduler(): void {
  setInterval(async () => {
    const repos = await getRepositories();
    const ledger = getLedgerService();
    const simulations = await repos.simulations.list();

    for (const simulation of simulations) {
      if (simulation.status !== "RUNNING" || tickInFlight.has(simulation.id)) continue;
      tickInFlight.add(simulation.id);
      // rules is a placeholder — runOneDay always re-fetches and uses this
      // simulation's own rules internally (self-correcting; needed since one
      // shared ctx here spans many simulations that can each run different
      // experiment rules).
      runOneDay({ repos, ledger, rules: DEFAULT_RULES }, simulation.id)
        .catch(async (err) => {
          if (err instanceof SimulationBusyError) return; // another caller (e.g. a replay) is driving this sim right now — not a failure, just skip this tick
          // eslint-disable-next-line no-console
          console.error(`[scheduler] day advance failed for simulation ${simulation.id}:`, err);
          // flow.md §16: a persistence/infra failure pauses the simulation
          // rather than silently retrying the same day forever with no
          // visible signal — FAILED is resumable via POST /resume once the
          // underlying issue clears (SimulationEngine.resumeSimulation).
          try {
            await repos.simulations.update(simulation.id, { status: "FAILED" });
          } catch (markErr) {
            // The same failure (e.g. persistence layer unreachable) likely
            // blocks this write too — nothing more we can do from here.
            // eslint-disable-next-line no-console
            console.error(`[scheduler] could not mark simulation ${simulation.id} as FAILED:`, markErr);
          }
        })
        .finally(() => tickInFlight.delete(simulation.id));
    }
  }, TICK_INTERVAL_MS);
}
