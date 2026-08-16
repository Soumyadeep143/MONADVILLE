import type { LedgerService } from "./LedgerService.js";
import { InMemoryLedgerService } from "./InMemoryLedgerService.js";
import { MonadLedgerService } from "./MonadLedgerService.js";
import { env } from "../config/env.js";

let cached: LedgerService | null = null;

export function getLedgerService(): LedgerService {
  if (cached) return cached;
  if (env.LEDGER_DRIVER === "monad") {
    cached = new MonadLedgerService(env.MONAD_RPC_URL ?? "", env.MONAD_LEDGER_ADDRESS ?? "");
  } else {
    cached = new InMemoryLedgerService();
  }
  return cached;
}

export type { LedgerService, TransferParams, TransferResult } from "./LedgerService.js";
