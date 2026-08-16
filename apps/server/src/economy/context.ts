import type { Repositories } from "../persistence/index.js";
import type { LedgerService } from "../blockchain/index.js";

/** Everything an economy operation needs: the persistence seam and the ledger seam. */
export interface EconomyContext {
  repos: Repositories;
  ledger: LedgerService;
}
