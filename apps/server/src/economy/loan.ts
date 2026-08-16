import type { Agent } from "@econforge/shared";
import { LOAN_DEFAULT_GRACE_DAYS, ACTIVITY_DELTA, REPUTATION_DELTA, bps, netWorth } from "@econforge/shared";
import type { EconomyContext } from "./context.js";
import { ActionError } from "./errors.js";
import { syncAgentCash } from "./sync.js";
import { recordTransaction, recordEvent } from "./record.js";
import { applyActivityDelta } from "./activity.js";
import { applyReputationDelta } from "./reputation.js";

export async function computeNetWorth(ctx: EconomyContext, agent: Agent): Promise<number> {
  const properties = await ctx.repos.properties.findByOwner(agent.id);
  const markedAssetValue = properties.reduce((sum, p) => sum + p.marketValue, 0);
  return netWorth(agent, markedAssetValue);
}

function isOverdue(loan: { status: string; dueDay: number }, gameDay: number): boolean {
  return loan.status === "ACTIVE" && gameDay > loan.dueDay;
}

export async function takeLoan(ctx: EconomyContext, agent: Agent, requestedAmount: number, simulationId: string, gameDay: number) {
  const existingLoans = await ctx.repos.loans.findByAgent(agent.id);
  if (existingLoans.some((l) => isOverdue(l, gameDay))) {
    throw new ActionError("OVERDUE_LOAN", "Agent has an overdue loan outstanding");
  }

  const worth = await computeNetWorth(ctx, agent);
  const maxLoan = bps(Math.max(worth, 0), ctx.rules.loanMaxPercentBps);
  if (requestedAmount <= 0 || requestedAmount > maxLoan) {
    throw new ActionError("INVALID_LOAN", `Requested amount exceeds 50% of net worth (max ${maxLoan})`);
  }
  const treasuryBalance = await ctx.ledger.getTreasuryBalance(simulationId);
  if (requestedAmount > treasuryBalance) {
    throw new ActionError("INSUFFICIENT_TREASURY", "Treasury cannot cover this loan right now");
  }

  const interestAmount = bps(requestedAmount, ctx.rules.loanInterestBps);
  const properties = await ctx.repos.properties.findByOwner(agent.id);
  const activeLoanCollateral = new Set(existingLoans.filter((l) => l.status === "ACTIVE").map((l) => l.collateralPropertyId));
  const collateral = properties.find((p) => !p.businessId && !activeLoanCollateral.has(p.id));

  const result = await ctx.ledger.fundLoan({ simulationId, agentId: agent.id, principal: requestedAmount, gameDay });
  if (result.status !== "CONFIRMED") {
    throw new ActionError("INSUFFICIENT_TREASURY", result.failureReason ?? "Loan disbursement failed");
  }

  const loan = await ctx.repos.loans.create({
    simulationId,
    agentId: agent.id,
    principal: requestedAmount,
    outstandingPrincipal: requestedAmount,
    interestRateBps: ctx.rules.loanInterestBps,
    interestAmount,
    totalRepayment: requestedAmount + interestAmount,
    collateralPropertyId: collateral?.id ?? null,
    status: "ACTIVE",
    issuedDay: gameDay,
    dueDay: gameDay + ctx.rules.loanDurationDays,
    blockchain: { creationTxHash: result.txHash, repaymentTxHash: null },
  });

  await syncAgentCash(ctx, simulationId, agent.id);
  await ctx.repos.agents.update(agent.id, {
    economic: {
      ...agent.economic,
      outstandingDebt: agent.economic.outstandingDebt + requestedAmount,
      totalBorrowed: agent.economic.totalBorrowed + requestedAmount,
    },
    activity: applyActivityDelta(agent.activity, ACTIVITY_DELTA.TAKE_LOAN, "TAKE_LOAN", gameDay),
    statistics: { ...agent.statistics, loansTaken: agent.statistics.loansTaken + 1 },
  });
  await recordTransaction(ctx, { simulationId, type: "LOAN", fromAgentId: null, toAgentId: agent.id, gameDay, result });
  await recordEvent(ctx, {
    simulationId,
    gameDay,
    type: "LOAN",
    agentIds: [agent.id],
    message: `Agent ${agent.id} took a loan of ${requestedAmount}`,
    metadata: { loanId: loan.id },
  });

  return loan;
}

export async function repayLoan(ctx: EconomyContext, agent: Agent, loanId: string, simulationId: string, gameDay: number) {
  const loan = await ctx.repos.loans.findById(loanId);
  if (!loan || loan.agentId !== agent.id || loan.status !== "ACTIVE") {
    throw new ActionError("INVALID_LOAN", "Loan not found or not active");
  }

  const result = await ctx.ledger.repayLoan({
    simulationId,
    agentId: agent.id,
    principal: loan.outstandingPrincipal,
    interest: loan.interestAmount,
    gameDay,
  });
  if (result.status !== "CONFIRMED") {
    throw new ActionError("INSUFFICIENT_FUNDS", result.failureReason ?? "Cannot afford full repayment");
  }

  await ctx.repos.loans.update(loan.id, {
    status: "REPAID",
    outstandingPrincipal: 0,
    blockchain: { ...loan.blockchain, repaymentTxHash: result.txHash },
  });

  await syncAgentCash(ctx, simulationId, agent.id);
  const onTime = gameDay <= loan.dueDay;
  await ctx.repos.agents.update(agent.id, {
    economic: {
      ...agent.economic,
      outstandingDebt: Math.max(0, agent.economic.outstandingDebt - loan.outstandingPrincipal),
      totalRepaid: agent.economic.totalRepaid + loan.outstandingPrincipal,
      totalInterestPaid: agent.economic.totalInterestPaid + loan.interestAmount,
    },
    activity: applyActivityDelta(agent.activity, ACTIVITY_DELTA.REPAY_LOAN, "REPAY_LOAN", gameDay),
    reputation: applyReputationDelta(
      agent.reputation,
      onTime ? REPUTATION_DELTA.LOAN_REPAID_ON_TIME : REPUTATION_DELTA.LATE_REPAYMENT,
      onTime ? "LOAN_REPAID_ON_TIME" : "LATE_REPAYMENT",
      gameDay,
    ),
    statistics: { ...agent.statistics, loansRepaid: agent.statistics.loansRepaid + 1 },
  });
  await recordTransaction(ctx, { simulationId, type: "REPAYMENT", fromAgentId: agent.id, toAgentId: null, gameDay, result });
  await recordEvent(ctx, {
    simulationId,
    gameDay,
    type: "REPAYMENT",
    agentIds: [agent.id],
    message: `Agent ${agent.id} repaid a loan${onTime ? "" : " (late)"}`,
    metadata: { loanId: loan.id, onTime },
  });
}

/** Deterministic per-day step (flow.md §4 "process loan maturities"). */
export async function processLoanMaturities(ctx: EconomyContext, simulationId: string, gameDay: number): Promise<void> {
  const loans = (await ctx.repos.loans.findBySimulation(simulationId)).filter((l) => l.status === "ACTIVE");
  for (const loan of loans) {
    if (gameDay <= loan.dueDay + LOAN_DEFAULT_GRACE_DAYS) continue;

    const agent = await ctx.repos.agents.findById(loan.agentId);
    if (!agent) continue;

    let seizeResult = null;
    if (loan.collateralPropertyId) {
      const collateral = await ctx.repos.properties.findById(loan.collateralPropertyId);
      if (collateral) {
        seizeResult = await ctx.ledger.seizeCollateral({ simulationId, agentId: agent.id, value: collateral.marketValue, gameDay });
        await ctx.repos.properties.update(collateral.id, { ownerAgentId: "TREASURY", businessId: null });
      }
    }

    await ctx.repos.loans.update(loan.id, { status: "DEFAULTED", outstandingPrincipal: 0 });
    await syncAgentCash(ctx, simulationId, agent.id);
    await ctx.repos.agents.update(agent.id, {
      economic: { ...agent.economic, outstandingDebt: Math.max(0, agent.economic.outstandingDebt - loan.outstandingPrincipal) },
      reputation: applyReputationDelta(agent.reputation, REPUTATION_DELTA.LOAN_DEFAULT, "LOAN_DEFAULT", gameDay),
      statistics: { ...agent.statistics, loansDefaulted: agent.statistics.loansDefaulted + 1 },
    });
    if (seizeResult) {
      await recordTransaction(ctx, { simulationId, type: "REPAYMENT", fromAgentId: agent.id, toAgentId: null, gameDay, result: seizeResult });
    }
    await recordEvent(ctx, {
      simulationId,
      gameDay,
      type: "DEFAULT",
      agentIds: [agent.id],
      message: `Agent ${agent.id} defaulted on a loan`,
      metadata: { loanId: loan.id },
    });
  }
}
