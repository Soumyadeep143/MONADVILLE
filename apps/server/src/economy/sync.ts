import type { EconomyContext } from "./context.js";

/**
 * MongoDB's `agent.economic.cash` is a cached view of the ledger (architecture.md §6).
 * Call this after any ledger-moving operation to bring the cache back in sync,
 * and persist the transaction record itself (architecture.md §7/§8: never
 * mutate cached state as if a transaction succeeded before the ledger confirms it —
 * callers only invoke this once the ledger call has already returned CONFIRMED).
 */
export async function syncAgentCash(ctx: EconomyContext, simulationId: string, agentId: string): Promise<number> {
  const balance = await ctx.ledger.getBalance(simulationId, agentId);
  const agent = await ctx.repos.agents.findById(agentId);
  if (agent) {
    await ctx.repos.agents.update(agentId, { economic: { ...agent.economic, cash: balance } });
  }
  return balance;
}
