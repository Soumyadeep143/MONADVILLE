import type { EventType, Transaction, TransactionType } from "@econforge/shared";
import type { EconomyContext } from "./context.js";
import type { TransferResult } from "../blockchain/index.js";

export async function recordTransaction(
  ctx: EconomyContext,
  args: {
    simulationId: string;
    type: TransactionType;
    fromAgentId: string | null;
    toAgentId: string | null;
    gameDay: number;
    result: TransferResult;
  },
): Promise<Transaction> {
  return ctx.repos.transactions.create({
    simulationId: args.simulationId,
    type: args.type,
    fromAgentId: args.fromAgentId,
    toAgentId: args.toAgentId,
    grossAmount: args.result.grossAmount,
    taxAmount: args.result.taxAmount,
    netAmount: args.result.netAmount,
    blockchain: {
      status: args.result.status,
      txHash: args.result.txHash,
      blockNumber: args.result.blockNumber,
    },
    gameDay: args.gameDay,
  });
}

export async function recordEvent(
  ctx: EconomyContext,
  args: {
    simulationId: string;
    gameDay: number;
    type: EventType;
    agentIds: string[];
    message: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.repos.events.create({
    simulationId: args.simulationId,
    gameDay: args.gameDay,
    type: args.type,
    agentIds: args.agentIds,
    message: args.message,
    metadata: args.metadata ?? {},
  });
}
