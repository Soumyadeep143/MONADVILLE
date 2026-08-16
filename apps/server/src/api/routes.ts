import { Router } from "express";
import {
  createSimulationSchema,
  questionnaireSubmitSchema,
  netWorth,
  type Personality,
} from "@econforge/shared";
import { QUESTIONNAIRE, QUESTIONNAIRE_VERSION, scorePersonality } from "../agents/questionnaire.js";
import { getCachedPersonality, setCachedPersonality } from "../agents/personalityStore.js";
import { requireAuth, devAuthProvider } from "../auth/index.js";
import { env } from "../config/env.js";
import { getEconomyContext } from "./context.js";
import { asyncHandler, sendError } from "./respond.js";
import { idempotent } from "./idempotency.js";
import * as SimulationEngine from "../simulation/SimulationEngine.js";
import { computeFullAnalytics } from "../analytics/index.js";

const DEFAULT_PERSONALITY: Personality = { risk: 50, spending: 50, ethics: 50, confidence: 50, fomo: 50 };

export const router = Router();

// ---------------------------------------------------------------------------
// §2 Health
router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    res.json({ status: "ok", service: "econforge-api" });
  }),
);

// Dev-only convenience — not in api.md. There's no real Supabase project in
// this pass, so this is how the dashboard gets a bearer token.
router.post(
  "/auth/dev-login",
  asyncHandler(async (req, res) => {
    if (env.AUTH_DRIVER !== "dev") {
      sendError(res, 403, "FORBIDDEN", "Dev login is disabled (AUTH_DRIVER != dev)");
      return;
    }
    const displayName = typeof req.body?.displayName === "string" && req.body.displayName.trim() ? req.body.displayName.trim() : "Player";
    const { token, identity } = devAuthProvider.issueToken(displayName);
    const ctx = await getEconomyContext();
    let user = await ctx.repos.users.findByAuthUserId(identity.authUserId);
    if (!user) user = await ctx.repos.users.create({ authUserId: identity.authUserId, displayName: identity.displayName });
    res.json({ token, userId: user.id, displayName: user.displayName });
  }),
);

// ---------------------------------------------------------------------------
// §3 User profile
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    const user = await ctx.repos.users.findById(req.userId!);
    if (!user) return sendError(res, 404, "NOT_FOUND", "User not found");
    const simulations = await ctx.repos.simulations.list();
    let agentCount = 0;
    for (const sim of simulations) {
      if (await ctx.repos.agents.findByUserAndSimulation(user.id, sim.id)) agentCount++;
    }
    res.json({ id: user.id, displayName: user.displayName, agentCount });
  }),
);

// ---------------------------------------------------------------------------
// §4 Questionnaire
router.get(
  "/questionnaire",
  asyncHandler(async (_req, res) => {
    res.json({
      version: QUESTIONNAIRE_VERSION,
      questions: QUESTIONNAIRE.map((q) => ({
        id: q.id,
        type: q.type,
        text: q.text,
        options: q.options.map((o) => ({ id: o.id, label: o.label })),
      })),
    });
  }),
);

router.post(
  "/questionnaire/submit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = questionnaireSubmitSchema.parse(req.body);
    const personality = scorePersonality(body.answers);
    setCachedPersonality(req.userId!, personality);
    res.json({ personality });
  }),
);

// ---------------------------------------------------------------------------
// §5 Agents
router.get(
  "/agents/:agentId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    const agent = await ctx.repos.agents.findById(req.params.agentId);
    if (!agent) return sendError(res, 404, "NOT_FOUND", "Agent not found");
    res.json(agent);
  }),
);

router.get(
  "/agents/:agentId/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    const agent = await ctx.repos.agents.findById(req.params.agentId);
    if (!agent) return sendError(res, 404, "NOT_FOUND", "Agent not found");
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const [events, transactions] = await Promise.all([
      ctx.repos.events.findBySimulation(agent.simulationId, { limit }),
      ctx.repos.transactions.findBySimulation(agent.simulationId, { agentId: agent.id, type: req.query.type as string | undefined, limit }),
    ]);
    res.json({
      events: events.filter((e) => e.agentIds.includes(agent.id)),
      transactions,
    });
  }),
);

router.get(
  "/agents/:agentId/loans",
  requireAuth,
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    const agent = await ctx.repos.agents.findById(req.params.agentId);
    if (!agent) return sendError(res, 404, "NOT_FOUND", "Agent not found");
    const loans = await ctx.repos.loans.findByAgent(agent.id);
    res.json({
      active: loans.filter((l) => l.status === "ACTIVE"),
      historical: loans.filter((l) => l.status !== "ACTIVE"),
      totalBorrowed: agent.economic.totalBorrowed,
      totalRepaid: agent.economic.totalRepaid,
      totalInterest: agent.economic.totalInterestPaid,
      defaults: agent.statistics.loansDefaulted,
    });
  }),
);

// ---------------------------------------------------------------------------
// §6 Simulations
router.get(
  "/simulations",
  asyncHandler(async (_req, res) => {
    const ctx = await getEconomyContext();
    res.json(await ctx.repos.simulations.list());
  }),
);

router.post(
  "/simulations",
  requireAuth,
  idempotent,
  asyncHandler(async (req, res) => {
    const body = createSimulationSchema.parse(req.body);
    const ctx = await getEconomyContext();
    const participants = body.agentIds.map((userId) => ({ userId, personality: getCachedPersonality(userId) ?? DEFAULT_PERSONALITY }));
    const simulation = await SimulationEngine.createSimulation(ctx, {
      name: body.name,
      durationDays: body.durationDays,
      participants,
      decisionPolicy: body.decisionPolicy,
      rulesOverride: body.rulesOverride,
    });
    res.status(201).json({
      simulationId: simulation.id,
      status: simulation.status,
      rulesVersion: simulation.rulesVersion,
      randomSeed: simulation.randomSeed,
      decisionPolicy: simulation.decisionPolicy,
      rules: simulation.rules,
    });
  }),
);

router.get(
  "/simulations/:simulationId",
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    const simulation = await ctx.repos.simulations.findById(req.params.simulationId);
    if (!simulation) return sendError(res, 404, "NOT_FOUND", "Simulation not found");
    const participants = await ctx.repos.agents.findBySimulation(simulation.id);
    res.json({ ...simulation, participantCount: participants.length });
  }),
);

router.post(
  "/simulations/:simulationId/start",
  requireAuth,
  idempotent,
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    res.json(await SimulationEngine.startSimulation(ctx, req.params.simulationId));
  }),
);
router.post(
  "/simulations/:simulationId/pause",
  requireAuth,
  idempotent,
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    res.json(await SimulationEngine.pauseSimulation(ctx, req.params.simulationId));
  }),
);
router.post(
  "/simulations/:simulationId/resume",
  requireAuth,
  idempotent,
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    res.json(await SimulationEngine.resumeSimulation(ctx, req.params.simulationId));
  }),
);
router.post(
  "/simulations/:simulationId/stop",
  requireAuth,
  idempotent,
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    res.json(await SimulationEngine.stopSimulation(ctx, req.params.simulationId));
  }),
);

// ---------------------------------------------------------------------------
// §7 World
router.get(
  "/simulations/:simulationId/world",
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    const simulationId = req.params.simulationId;
    const simulation = await ctx.repos.simulations.findById(simulationId);
    if (!simulation) return sendError(res, 404, "NOT_FOUND", "Simulation not found");
    const [properties, businesses, agents, treasuryBalance] = await Promise.all([
      ctx.repos.properties.findBySimulation(simulationId),
      ctx.repos.businesses.findBySimulation(simulationId),
      ctx.repos.agents.findBySimulation(simulationId),
      ctx.ledger.getTreasuryBalance(simulationId),
    ]);
    res.json({
      currentDay: simulation.currentDay,
      properties,
      businesses,
      activeAgents: agents.map((a) => ({ id: a.id, cash: a.economic.cash, reputation: a.reputation.score, activity: a.activity.score, employmentStatus: a.state.employmentStatus })),
      prices: { meal: businesses.find((b) => b.type === "RESTAURANT")?.price ?? null, ticket: businesses.find((b) => b.type === "THEATRE")?.price ?? null },
      treasuryBalance,
    });
  }),
);

router.get(
  "/simulations/:simulationId/events",
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    const day = req.query.day ? Number(req.query.day) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    res.json(await ctx.repos.events.findBySimulation(req.params.simulationId, { day, type: req.query.type as string | undefined, limit }));
  }),
);

// ---------------------------------------------------------------------------
// §8 Economy
router.get(
  "/simulations/:simulationId/economy",
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    const simulationId = req.params.simulationId;
    const simulation = await ctx.repos.simulations.findById(simulationId);
    if (!simulation) return sendError(res, 404, "NOT_FOUND", "Simulation not found");
    const [agents, businesses, treasuryBalance] = await Promise.all([
      ctx.repos.agents.findBySimulation(simulationId),
      ctx.repos.businesses.findBySimulation(simulationId),
      ctx.ledger.getTreasuryBalance(simulationId),
    ]);
    const wages = businesses.flatMap((b) => b.employees.map((e) => e.wage));
    res.json({
      day: simulation.currentDay,
      moneySupply: Math.round((agents.reduce((s, a) => s + a.economic.cash, 0) + treasuryBalance) * 100) / 100,
      treasuryBalance,
      averageWealth: simulation.metrics.averageWealth,
      medianWealth: simulation.metrics.medianWealth,
      gini: simulation.metrics.gini,
      top10WealthShare: simulation.metrics.top10WealthShare,
      businesses: {
        farms: businesses.filter((b) => b.type === "FARM" && b.status === "ACTIVE").length,
        restaurants: businesses.filter((b) => b.type === "RESTAURANT" && b.status === "ACTIVE").length,
        theatres: businesses.filter((b) => b.type === "THEATRE" && b.status === "ACTIVE").length,
      },
      averageWage: wages.length ? Math.round((wages.reduce((a, b) => a + b, 0) / wages.length) * 100) / 100 : 0,
    });
  }),
);

router.get(
  "/simulations/:simulationId/leaderboard",
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    const type = (req.query.type as string) ?? "wealth";
    const agents = await ctx.repos.agents.findBySimulation(req.params.simulationId);
    const properties = await ctx.repos.properties.findBySimulation(req.params.simulationId);

    if (type === "business") {
      const businesses = await ctx.repos.businesses.findBySimulation(req.params.simulationId);
      const byOwner = new Map<string, number>();
      for (const b of businesses) byOwner.set(b.ownerAgentId, (byOwner.get(b.ownerAgentId) ?? 0) + b.statistics.revenue);
      const ranked = [...byOwner.entries()].sort((a, b) => b[1] - a[1]).map(([agentId, revenue]) => ({ agentId, revenue }));
      res.json({ type, ranked });
      return;
    }

    const rank = (score: (agentId: string) => number) =>
      agents
        .map((a) => ({ agentId: a.id, score: score(a.id) }))
        .sort((a, b) => b.score - a.score);

    let ranked;
    if (type === "reputation") ranked = rank((id) => agents.find((a) => a.id === id)!.reputation.score);
    else if (type === "activity") ranked = rank((id) => agents.find((a) => a.id === id)!.activity.score);
    else {
      ranked = rank((id) => {
        const agent = agents.find((a) => a.id === id)!;
        const marked = properties.filter((p) => p.ownerAgentId === id).reduce((s, p) => s + p.marketValue, 0);
        return netWorth(agent, marked);
      });
    }
    res.json({ type, ranked });
  }),
);

// ---------------------------------------------------------------------------
// §9 Businesses
router.get(
  "/simulations/:simulationId/businesses",
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    res.json(
      await ctx.repos.businesses.findBySimulation(req.params.simulationId, {
        type: req.query.type as string | undefined,
        ownerId: req.query.ownerId as string | undefined,
        status: req.query.status as string | undefined,
      }),
    );
  }),
);

router.get(
  "/businesses/:businessId",
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    const business = await ctx.repos.businesses.findById(req.params.businessId);
    if (!business) return sendError(res, 404, "NOT_FOUND", "Business not found");
    res.json(business);
  }),
);

// ---------------------------------------------------------------------------
// §10 Loans
router.get(
  "/simulations/:simulationId/loans",
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    const loans = await ctx.repos.loans.findBySimulation(req.params.simulationId);
    res.json({
      loans,
      active: loans.filter((l) => l.status === "ACTIVE").length,
      repaid: loans.filter((l) => l.status === "REPAID").length,
      defaulted: loans.filter((l) => l.status === "DEFAULTED").length,
    });
  }),
);

// ---------------------------------------------------------------------------
// §11 Transactions
router.get(
  "/simulations/:simulationId/transactions",
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    res.json(
      await ctx.repos.transactions.findBySimulation(req.params.simulationId, {
        agentId: req.query.agentId as string | undefined,
        type: req.query.type as string | undefined,
        day: req.query.day ? Number(req.query.day) : undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : 100,
      }),
    );
  }),
);

router.get(
  "/transactions/:transactionId",
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    const tx = await ctx.repos.transactions.findById(req.params.transactionId);
    if (!tx) return sendError(res, 404, "NOT_FOUND", "Transaction not found");
    res.json(tx);
  }),
);

// ---------------------------------------------------------------------------
// §12 Analytics
router.get(
  "/simulations/:simulationId/analytics",
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    const simulation = await ctx.repos.simulations.findById(req.params.simulationId);
    if (!simulation) return sendError(res, 404, "NOT_FOUND", "Simulation not found");
    res.json(await computeFullAnalytics(ctx, req.params.simulationId));
  }),
);

// ---------------------------------------------------------------------------
// §10 Decisions (not in api.md, but the "live decision terminal" needs it)
router.get(
  "/simulations/:simulationId/decisions",
  asyncHandler(async (req, res) => {
    const ctx = await getEconomyContext();
    res.json(
      await ctx.repos.decisions.findBySimulation(req.params.simulationId, {
        agentId: req.query.agentId as string | undefined,
        day: req.query.day ? Number(req.query.day) : undefined,
      }),
    );
  }),
);
