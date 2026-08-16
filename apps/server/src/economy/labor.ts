import type { Agent, Business } from "@econforge/shared";
import { ACTIVITY_DELTA } from "@econforge/shared";
import type { EconomyContext } from "./context.js";
import { ActionError } from "./errors.js";
import { recordEvent } from "./record.js";
import { applyActivityDelta } from "./activity.js";

async function hire(ctx: EconomyContext, business: Business, agent: Agent, gameDay: number): Promise<Business> {
  const updated = await ctx.repos.businesses.update(business.id, {
    employees: [...business.employees, { agentId: agent.id, wage: ctx.rules.workerWage }],
    status: business.employees.length + 1 >= ctx.rules.businessWorkers ? "ACTIVE" : business.status,
  });
  await ctx.repos.agents.update(agent.id, {
    state: { ...agent.state, employmentStatus: "EMPLOYED", employerId: business.ownerAgentId },
    activity: applyActivityDelta(agent.activity, ACTIVITY_DELTA.WORK_DAY, "WORK", gameDay),
  });
  return updated;
}

/** Agent-initiated WORK action: an unemployed agent takes an open slot at a specific business (prd.md §17). */
export async function joinBusiness(ctx: EconomyContext, agent: Agent, businessId: string, simulationId: string, gameDay: number): Promise<Business> {
  if (agent.state.employmentStatus === "EMPLOYED") {
    throw new ActionError("INVALID_ACTION", "Agent is already employed");
  }
  const business = await ctx.repos.businesses.findById(businessId);
  if (!business || business.simulationId !== simulationId || business.status === "FAILED") {
    throw new ActionError("INVALID_BUSINESS", "Business not found or not hiring");
  }
  if (business.employees.length >= ctx.rules.businessWorkers) {
    throw new ActionError("INVALID_BUSINESS", "Business has no open positions");
  }
  const updated = await hire(ctx, business, agent, gameDay);
  await recordEvent(ctx, {
    simulationId,
    gameDay,
    type: "TRADE",
    agentIds: [agent.id, business.ownerAgentId],
    message: `Agent ${agent.id} joined a ${business.type.toLowerCase()} as an employee`,
    metadata: { businessId },
  });
  return updated;
}

/**
 * Deterministic safety net, run once at the start of each day (flow.md §4
 * "process business operations"): fills any remaining vacancies from the
 * unemployed pool so a business created without enough available workers
 * doesn't stay permanently understaffed just because no agent's LLM
 * decision happened to target it.
 */
export async function autoFillVacancies(ctx: EconomyContext, simulationId: string, gameDay: number): Promise<void> {
  const businesses = (await ctx.repos.businesses.findBySimulation(simulationId)).filter(
    (b) => b.status !== "FAILED" && b.employees.length < ctx.rules.businessWorkers,
  );
  if (businesses.length === 0) return;

  let unemployed = (await ctx.repos.agents.findBySimulation(simulationId)).filter(
    (a) => a.state.employmentStatus === "UNEMPLOYED",
  );

  for (const business of businesses) {
    let current = business;
    while (current.employees.length < ctx.rules.businessWorkers && unemployed.length > 0) {
      const [candidate, ...rest] = unemployed;
      unemployed = rest;
      current = await hire(ctx, current, candidate, gameDay);
    }
  }
}
