import type { EconomyContext } from "../economy/context.js";
import { getRepositories } from "../persistence/index.js";
import { getLedgerService } from "../blockchain/index.js";

export async function getEconomyContext(): Promise<EconomyContext> {
  return { repos: await getRepositories(), ledger: getLedgerService() };
}
