import { randomUUID } from "node:crypto";
import { TRANSACTION_TAX_BPS, bps } from "@econforge/shared";
import type { LedgerService, TransferParams, TransferResult } from "./LedgerService.js";

interface Ledger {
  balances: Map<string, number>; // agentId -> cash
  treasury: number;
}

function fakeTxHash(): string {
  return "0x" + randomUUID().replace(/-/g, "");
}

/**
 * In-process stand-in for the Monad EconomicLedger contract. Implements the
 * real 2% tax + treasury accounting (prd.md §12/§13) so the economy is
 * correct without a chain attached. Every simulation gets its own ledger,
 * isolated from others, same as a real deployed contract instance would be
 * scoped by simulationId.
 */
export class InMemoryLedgerService implements LedgerService {
  private ledgers = new Map<string, Ledger>();
  private blockNumber = 0;

  private ledgerFor(simulationId: string): Ledger {
    let l = this.ledgers.get(simulationId);
    if (!l) {
      l = { balances: new Map(), treasury: 0 };
      this.ledgers.set(simulationId, l);
    }
    return l;
  }

  async registerAgent(simulationId: string, agentId: string, startingCash: number): Promise<void> {
    const ledger = this.ledgerFor(simulationId);
    if (!ledger.balances.has(agentId)) {
      ledger.balances.set(agentId, startingCash);
    }
  }

  async transfer(params: TransferParams): Promise<TransferResult> {
    const { simulationId, fromAgentId, toAgentId, grossAmount, taxable = true } = params;
    const ledger = this.ledgerFor(simulationId);

    if (grossAmount <= 0) {
      return this.fail("Transfer amount must be positive");
    }

    const senderBalance = fromAgentId ? ledger.balances.get(fromAgentId) ?? 0 : ledger.treasury;
    if (senderBalance < grossAmount) {
      return this.fail("Insufficient funds");
    }

    const taxAmount = taxable ? bps(grossAmount, TRANSACTION_TAX_BPS) : 0;
    const netAmount = Math.round((grossAmount - taxAmount) * 100) / 100;

    // Debit sender
    if (fromAgentId) {
      ledger.balances.set(fromAgentId, senderBalance - grossAmount);
    } else {
      ledger.treasury = senderBalance - grossAmount;
    }

    // Credit recipient with net, treasury with tax. If the recipient IS the
    // treasury, both pieces land in the same place, so it always nets out
    // to the full gross amount regardless of the tax split.
    if (toAgentId) {
      ledger.balances.set(toAgentId, (ledger.balances.get(toAgentId) ?? 0) + netAmount);
      ledger.treasury += taxAmount;
    } else {
      ledger.treasury += netAmount + taxAmount;
    }

    return {
      status: "CONFIRMED",
      txHash: fakeTxHash(),
      blockNumber: ++this.blockNumber,
      grossAmount,
      taxAmount,
      netAmount,
    };
  }

  async fundLoan(params: { simulationId: string; agentId: string; principal: number; gameDay: number }): Promise<TransferResult> {
    return this.transfer({
      simulationId: params.simulationId,
      fromAgentId: null,
      toAgentId: params.agentId,
      grossAmount: params.principal,
      type: "LOAN",
      gameDay: params.gameDay,
      taxable: false,
    });
  }

  async repayLoan(params: {
    simulationId: string;
    agentId: string;
    principal: number;
    interest: number;
    gameDay: number;
  }): Promise<TransferResult> {
    return this.transfer({
      simulationId: params.simulationId,
      fromAgentId: params.agentId,
      toAgentId: null,
      grossAmount: Math.round((params.principal + params.interest) * 100) / 100,
      type: "REPAYMENT",
      gameDay: params.gameDay,
      taxable: false, // recipient is treasury either way; taxable split would be a no-op
    });
  }

  async seizeCollateral(params: { simulationId: string; agentId: string; value: number; gameDay: number }): Promise<TransferResult> {
    const ledger = this.ledgerFor(params.simulationId);
    const balance = ledger.balances.get(params.agentId) ?? 0;
    const seized = Math.min(balance, params.value);
    ledger.balances.set(params.agentId, balance - seized);
    ledger.treasury += seized;
    return {
      status: "CONFIRMED",
      txHash: fakeTxHash(),
      blockNumber: ++this.blockNumber,
      grossAmount: params.value,
      taxAmount: 0,
      netAmount: seized,
    };
  }

  async getBalance(simulationId: string, agentId: string): Promise<number> {
    return this.ledgerFor(simulationId).balances.get(agentId) ?? 0;
  }

  async getTreasuryBalance(simulationId: string): Promise<number> {
    return this.ledgerFor(simulationId).treasury;
  }

  private fail(reason: string): TransferResult {
    return { status: "FAILED", txHash: null, blockNumber: null, grossAmount: 0, taxAmount: 0, netAmount: 0, failureReason: reason };
  }
}
