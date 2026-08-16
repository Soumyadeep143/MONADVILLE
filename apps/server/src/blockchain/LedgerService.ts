// The economic-ledger seam — architecture.md §6/§7/§9, flow.md §6/§11.
// Monad is the authoritative source for balances, tax, treasury, and loan
// principal/repayment events. Everything else in this app (the economy
// engine) only ever moves money through this interface — never by mutating
// agent.economic.cash directly. MongoDB's cached `economic.cash` is kept in
// sync by reading `getBalance()` back after a confirmed transfer.
//
// `InMemoryLedgerService` implements the real 2% tax/treasury math so the
// simulation is economically correct with no chain attached.
// `MonadLedgerService` (blockchain/MonadLedgerService.ts) is the stub the
// Monad dev fills in with real on-chain calls against the same interface.

import type { TransactionType } from "@econforge/shared";

export interface TransferParams {
  simulationId: string;
  /** null = treasury is the source (e.g. loan disbursement). */
  fromAgentId: string | null;
  /** null = treasury is the destination (e.g. loan repayment, tax-only transfer). */
  toAgentId: string | null;
  grossAmount: number;
  type: TransactionType;
  gameDay: number;
  /** Per prd.md §12: most transfers are taxed; a few (loan disbursement) are not. Default true. */
  taxable?: boolean;
  /** Basis points for this transfer's tax, when taxable. Callers pass the active simulation's own rate (EconomyContext.rules.transactionTaxBps) so tax-rate experiments (prd.md §22) actually take effect; defaults to the global 2% constant if omitted. */
  taxBps?: number;
}

export interface TransferResult {
  status: "CONFIRMED" | "FAILED";
  txHash: string | null;
  blockNumber: number | null;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
  failureReason?: string;
}

export interface LedgerService {
  /** One-time genesis: mints `startingCash` into a fresh agent's ledger balance. */
  registerAgent(simulationId: string, agentId: string, startingCash: number): Promise<void>;

  /** Standard taxed-or-not transfer between two parties (agent or treasury, per null convention above). */
  transfer(params: TransferParams): Promise<TransferResult>;

  /** Treasury -> agent, untaxed, only allowed up to current treasury liquidity. */
  fundLoan(params: { simulationId: string; agentId: string; principal: number; gameDay: number }): Promise<TransferResult>;

  /** Agent -> treasury for principal + interest. Uses transfer() under the hood (recipient is treasury either way). */
  repayLoan(params: {
    simulationId: string;
    agentId: string;
    principal: number;
    interest: number;
    gameDay: number;
  }): Promise<TransferResult>;

  /** On default: collateral value moves to treasury as a cash-equivalent (POC simplification, no NFT/asset transfer on-chain). */
  seizeCollateral(params: { simulationId: string; agentId: string; value: number; gameDay: number }): Promise<TransferResult>;

  getBalance(simulationId: string, agentId: string): Promise<number>;
  getTreasuryBalance(simulationId: string): Promise<number>;
}
