// STUB — the Monad ledger dev implements this against LedgerService.ts and
// the deployed EconomicLedger contract (see /contracts/README.md for the
// expected contract interface). Until then, LEDGER_DRIVER must stay
// "memory" (the default — see ./index.ts), which runs on InMemoryLedgerService.

import type { LedgerService, TransferParams, TransferResult } from "./LedgerService.js";

const NOT_IMPLEMENTED =
  "Monad ledger driver not implemented yet. See apps/server/src/blockchain/MonadLedgerService.ts " +
  "and contracts/README.md. Set LEDGER_DRIVER=memory (default) until this is ready.";

export class MonadLedgerService implements LedgerService {
  constructor(_rpcUrl: string, _ledgerAddress: string) {}

  async registerAgent(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async transfer(_params: TransferParams): Promise<TransferResult> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async fundLoan(): Promise<TransferResult> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async repayLoan(): Promise<TransferResult> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async seizeCollateral(): Promise<TransferResult> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async getBalance(): Promise<number> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async getTreasuryBalance(): Promise<number> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
