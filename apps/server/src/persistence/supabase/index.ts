// Supabase/Postgres implementation of the Repositories seam (../repositories).
// Table shapes come from the `init_econforge_schema` migration applied via
// the Supabase MCP server — see docs/database.md §3-11 for the field-level
// origin (this replaces the never-implemented Mongo driver in ../mongo/).
//
// Every table uses a `bigint identity` primary key; the Repositories contract
// exposes ids as `string`, so every id crossing the boundary is converted
// with toId/fromId. Nested object fields (personality, economic, state,
// employees, blockchain, etc.) are stored as jsonb and pass through
// untouched — their shape is owned by packages/shared/src/types.ts, not by
// this file.
//
// `updated_at` columns are maintained by a DB trigger (see migration), so
// update() methods never set it themselves.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Agent,
  AgentDecisionRecord,
  Business,
  Loan,
  Property,
  Simulation,
  SimulationEvent,
  Transaction,
  User,
} from "@econforge/shared";
import type {
  AgentDecisionRepository,
  AgentRepository,
  BusinessRepository,
  EventRepository,
  LoanRepository,
  PropertyRepository,
  Repositories,
  SimulationRepository,
  TransactionRepository,
  UserRepository,
} from "../repositories/index.js";
import { getSupabaseAdminClient } from "./client.js";

function toId(id: string): number {
  return Number(id);
}
function fromId(id: number): string {
  return String(id);
}
function toIdOrNull(id: string | null): number | null {
  return id === null ? null : Number(id);
}
function fromIdOrNull(id: number | null): string | null {
  return id === null ? null : String(id);
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null) throw new Error("Supabase query returned no row");
  return res.data;
}
function unwrapList<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}
/** Only copies keys the caller actually set — lets one function serve both create() (all keys present) and update() (a sparse patch). */
function setIfDefined<K extends string>(row: Record<string, unknown>, key: K, value: unknown): void {
  if (value !== undefined) row[key] = value;
}

// ---------------------------------------------------------------- users ---
interface UserRow {
  id: number;
  auth_user_id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}
function rowToUser(r: UserRow): User {
  return {
    id: fromId(r.id),
    authUserId: r.auth_user_id,
    displayName: r.display_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

class SupabaseUserRepository implements UserRepository {
  constructor(private db: SupabaseClient) {}

  async create(user: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User> {
    const res = await this.db
      .from("users")
      .insert({ auth_user_id: user.authUserId, display_name: user.displayName })
      .select()
      .single();
    return rowToUser(unwrap<UserRow>(res));
  }
  async findById(id: string): Promise<User | null> {
    const res = await this.db.from("users").select().eq("id", toId(id)).maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return res.data ? rowToUser(res.data as UserRow) : null;
  }
  async findByAuthUserId(authUserId: string): Promise<User | null> {
    const res = await this.db.from("users").select().eq("auth_user_id", authUserId).maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return res.data ? rowToUser(res.data as UserRow) : null;
  }
}

// ---------------------------------------------------------- simulations ---
interface SimulationRow {
  id: number;
  name: string;
  status: Simulation["status"];
  rules_version: string;
  prompt_version: string;
  random_seed: number;
  duration_days: number;
  current_day: number;
  rules: Simulation["rules"];
  decision_policy: Simulation["decisionPolicy"];
  metrics: Simulation["metrics"];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}
function rowToSimulation(r: SimulationRow): Simulation {
  return {
    id: fromId(r.id),
    name: r.name,
    status: r.status,
    rulesVersion: r.rules_version,
    promptVersion: r.prompt_version,
    randomSeed: r.random_seed,
    durationDays: r.duration_days,
    currentDay: r.current_day,
    rules: r.rules,
    decisionPolicy: r.decision_policy,
    metrics: r.metrics,
    createdAt: r.created_at,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}
function simulationToRow(s: Partial<Omit<Simulation, "id" | "createdAt">>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  setIfDefined(row, "name", s.name);
  setIfDefined(row, "status", s.status);
  setIfDefined(row, "rules_version", s.rulesVersion);
  setIfDefined(row, "prompt_version", s.promptVersion);
  setIfDefined(row, "random_seed", s.randomSeed);
  setIfDefined(row, "duration_days", s.durationDays);
  setIfDefined(row, "current_day", s.currentDay);
  setIfDefined(row, "rules", s.rules);
  setIfDefined(row, "decision_policy", s.decisionPolicy);
  setIfDefined(row, "metrics", s.metrics);
  setIfDefined(row, "started_at", s.startedAt);
  setIfDefined(row, "completed_at", s.completedAt);
  return row;
}

class SupabaseSimulationRepository implements SimulationRepository {
  constructor(private db: SupabaseClient) {}

  async create(simulation: Omit<Simulation, "id" | "createdAt">): Promise<Simulation> {
    const res = await this.db.from("simulations").insert(simulationToRow(simulation)).select().single();
    return rowToSimulation(unwrap<SimulationRow>(res));
  }
  async findById(id: string): Promise<Simulation | null> {
    const res = await this.db.from("simulations").select().eq("id", toId(id)).maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return res.data ? rowToSimulation(res.data as SimulationRow) : null;
  }
  async list(): Promise<Simulation[]> {
    const res = await this.db.from("simulations").select().order("created_at", { ascending: false });
    return unwrapList<SimulationRow>(res).map(rowToSimulation);
  }
  async update(id: string, patch: Partial<Omit<Simulation, "id" | "createdAt">>): Promise<Simulation> {
    const res = await this.db.from("simulations").update(simulationToRow(patch)).eq("id", toId(id)).select().single();
    return rowToSimulation(unwrap<SimulationRow>(res));
  }
}

// --------------------------------------------------------------- agents ---
interface AgentRow {
  id: number;
  user_id: number;
  simulation_id: number;
  personality: Agent["personality"];
  economic: Agent["economic"];
  state: Agent["state"];
  reputation: Agent["reputation"];
  activity: Agent["activity"];
  statistics: Agent["statistics"];
  memory: Agent["memory"];
  created_at: string;
  updated_at: string;
}
function rowToAgent(r: AgentRow): Agent {
  return {
    id: fromId(r.id),
    userId: fromId(r.user_id),
    simulationId: fromId(r.simulation_id),
    personality: r.personality,
    economic: r.economic,
    state: r.state,
    reputation: r.reputation,
    activity: r.activity,
    statistics: r.statistics,
    memory: r.memory,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function agentToRow(a: Partial<Omit<Agent, "id" | "createdAt">>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (a.userId !== undefined) row.user_id = toId(a.userId);
  if (a.simulationId !== undefined) row.simulation_id = toId(a.simulationId);
  setIfDefined(row, "personality", a.personality);
  setIfDefined(row, "economic", a.economic);
  setIfDefined(row, "state", a.state);
  setIfDefined(row, "reputation", a.reputation);
  setIfDefined(row, "activity", a.activity);
  setIfDefined(row, "statistics", a.statistics);
  setIfDefined(row, "memory", a.memory);
  return row;
}

class SupabaseAgentRepository implements AgentRepository {
  constructor(private db: SupabaseClient) {}

  async create(agent: Omit<Agent, "id" | "createdAt" | "updatedAt">): Promise<Agent> {
    const res = await this.db.from("agents").insert(agentToRow(agent)).select().single();
    return rowToAgent(unwrap<AgentRow>(res));
  }
  async findById(id: string): Promise<Agent | null> {
    const res = await this.db.from("agents").select().eq("id", toId(id)).maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return res.data ? rowToAgent(res.data as AgentRow) : null;
  }
  async findBySimulation(simulationId: string): Promise<Agent[]> {
    const res = await this.db.from("agents").select().eq("simulation_id", toId(simulationId));
    return unwrapList<AgentRow>(res).map(rowToAgent);
  }
  async findByUserAndSimulation(userId: string, simulationId: string): Promise<Agent | null> {
    const res = await this.db
      .from("agents")
      .select()
      .eq("user_id", toId(userId))
      .eq("simulation_id", toId(simulationId))
      .maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return res.data ? rowToAgent(res.data as AgentRow) : null;
  }
  async update(id: string, patch: Partial<Omit<Agent, "id" | "createdAt">>): Promise<Agent> {
    const res = await this.db.from("agents").update(agentToRow(patch)).eq("id", toId(id)).select().single();
    return rowToAgent(unwrap<AgentRow>(res));
  }
}

// ----------------------------------------------------------- businesses ---
interface BusinessRow {
  id: number;
  simulation_id: number;
  owner_agent_id: number;
  type: Business["type"];
  property_id: number | null;
  status: Business["status"];
  employees: Business["employees"];
  price: number;
  inventory: Business["inventory"];
  statistics: Business["statistics"];
  created_at: string;
  updated_at: string;
}
function rowToBusiness(r: BusinessRow): Business {
  return {
    id: fromId(r.id),
    simulationId: fromId(r.simulation_id),
    ownerAgentId: fromId(r.owner_agent_id),
    type: r.type,
    // property_id is nullable only to break the businesses<->properties
    // circular FK at migration time — economy/business.ts always creates a
    // business with a property already in hand.
    propertyId: fromId(r.property_id as number),
    status: r.status,
    employees: r.employees,
    price: Number(r.price),
    inventory: r.inventory,
    statistics: r.statistics,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function businessToRow(b: Partial<Omit<Business, "id" | "createdAt">>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (b.simulationId !== undefined) row.simulation_id = toId(b.simulationId);
  if (b.ownerAgentId !== undefined) row.owner_agent_id = toId(b.ownerAgentId);
  setIfDefined(row, "type", b.type);
  if (b.propertyId !== undefined) row.property_id = toId(b.propertyId);
  setIfDefined(row, "status", b.status);
  setIfDefined(row, "employees", b.employees);
  setIfDefined(row, "price", b.price);
  setIfDefined(row, "inventory", b.inventory);
  setIfDefined(row, "statistics", b.statistics);
  return row;
}

class SupabaseBusinessRepository implements BusinessRepository {
  constructor(private db: SupabaseClient) {}

  async create(business: Omit<Business, "id" | "createdAt" | "updatedAt">): Promise<Business> {
    const res = await this.db.from("businesses").insert(businessToRow(business)).select().single();
    return rowToBusiness(unwrap<BusinessRow>(res));
  }
  async findById(id: string): Promise<Business | null> {
    const res = await this.db.from("businesses").select().eq("id", toId(id)).maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return res.data ? rowToBusiness(res.data as BusinessRow) : null;
  }
  async findBySimulation(
    simulationId: string,
    filter?: { type?: string; ownerId?: string; status?: string },
  ): Promise<Business[]> {
    let q = this.db.from("businesses").select().eq("simulation_id", toId(simulationId));
    if (filter?.type) q = q.eq("type", filter.type);
    if (filter?.ownerId) q = q.eq("owner_agent_id", toId(filter.ownerId));
    if (filter?.status) q = q.eq("status", filter.status);
    return unwrapList<BusinessRow>(await q).map(rowToBusiness);
  }
  async update(id: string, patch: Partial<Omit<Business, "id" | "createdAt">>): Promise<Business> {
    const res = await this.db.from("businesses").update(businessToRow(patch)).eq("id", toId(id)).select().single();
    return rowToBusiness(unwrap<BusinessRow>(res));
  }
}

// ------------------------------------------------------------ properties --
interface PropertyRow {
  id: number;
  simulation_id: number;
  owner_agent_id: number;
  type: Property["type"];
  land_value: number;
  construction_value: number;
  market_value: number;
  business_id: number | null;
  for_sale: boolean;
  created_at: string;
  updated_at: string;
}
function rowToProperty(r: PropertyRow): Property {
  return {
    id: fromId(r.id),
    simulationId: fromId(r.simulation_id),
    ownerAgentId: fromId(r.owner_agent_id),
    type: r.type,
    landValue: Number(r.land_value),
    constructionValue: Number(r.construction_value),
    marketValue: Number(r.market_value),
    businessId: fromIdOrNull(r.business_id),
    forSale: r.for_sale,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function propertyToRow(p: Partial<Omit<Property, "id" | "createdAt">>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.simulationId !== undefined) row.simulation_id = toId(p.simulationId);
  if (p.ownerAgentId !== undefined) row.owner_agent_id = toId(p.ownerAgentId);
  setIfDefined(row, "type", p.type);
  setIfDefined(row, "land_value", p.landValue);
  setIfDefined(row, "construction_value", p.constructionValue);
  setIfDefined(row, "market_value", p.marketValue);
  if (p.businessId !== undefined) row.business_id = toIdOrNull(p.businessId);
  setIfDefined(row, "for_sale", p.forSale);
  return row;
}

class SupabasePropertyRepository implements PropertyRepository {
  constructor(private db: SupabaseClient) {}

  async create(property: Omit<Property, "id" | "createdAt" | "updatedAt">): Promise<Property> {
    const res = await this.db.from("properties").insert(propertyToRow(property)).select().single();
    return rowToProperty(unwrap<PropertyRow>(res));
  }
  async findById(id: string): Promise<Property | null> {
    const res = await this.db.from("properties").select().eq("id", toId(id)).maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return res.data ? rowToProperty(res.data as PropertyRow) : null;
  }
  async findBySimulation(simulationId: string): Promise<Property[]> {
    const res = await this.db.from("properties").select().eq("simulation_id", toId(simulationId));
    return unwrapList<PropertyRow>(res).map(rowToProperty);
  }
  async findByOwner(ownerAgentId: string): Promise<Property[]> {
    const res = await this.db.from("properties").select().eq("owner_agent_id", toId(ownerAgentId));
    return unwrapList<PropertyRow>(res).map(rowToProperty);
  }
  async update(id: string, patch: Partial<Omit<Property, "id" | "createdAt">>): Promise<Property> {
    const res = await this.db.from("properties").update(propertyToRow(patch)).eq("id", toId(id)).select().single();
    return rowToProperty(unwrap<PropertyRow>(res));
  }
}

// ---------------------------------------------------------- transactions --
interface TransactionRow {
  id: number;
  simulation_id: number;
  type: Transaction["type"];
  from_agent_id: number | null;
  to_agent_id: number | null;
  gross_amount: number;
  tax_amount: number;
  net_amount: number;
  blockchain: Transaction["blockchain"];
  game_day: number;
  created_at: string;
}
function rowToTransaction(r: TransactionRow): Transaction {
  return {
    id: fromId(r.id),
    simulationId: fromId(r.simulation_id),
    type: r.type,
    fromAgentId: fromIdOrNull(r.from_agent_id),
    toAgentId: fromIdOrNull(r.to_agent_id),
    grossAmount: Number(r.gross_amount),
    taxAmount: Number(r.tax_amount),
    netAmount: Number(r.net_amount),
    blockchain: r.blockchain,
    gameDay: r.game_day,
    createdAt: r.created_at,
  };
}
function transactionToRow(t: Partial<Omit<Transaction, "id" | "createdAt">>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (t.simulationId !== undefined) row.simulation_id = toId(t.simulationId);
  setIfDefined(row, "type", t.type);
  if (t.fromAgentId !== undefined) row.from_agent_id = toIdOrNull(t.fromAgentId);
  if (t.toAgentId !== undefined) row.to_agent_id = toIdOrNull(t.toAgentId);
  setIfDefined(row, "gross_amount", t.grossAmount);
  setIfDefined(row, "tax_amount", t.taxAmount);
  setIfDefined(row, "net_amount", t.netAmount);
  setIfDefined(row, "blockchain", t.blockchain);
  setIfDefined(row, "game_day", t.gameDay);
  return row;
}

class SupabaseTransactionRepository implements TransactionRepository {
  constructor(private db: SupabaseClient) {}

  async create(tx: Omit<Transaction, "id" | "createdAt">): Promise<Transaction> {
    const res = await this.db.from("transactions").insert(transactionToRow(tx)).select().single();
    return rowToTransaction(unwrap<TransactionRow>(res));
  }
  async findById(id: string): Promise<Transaction | null> {
    const res = await this.db.from("transactions").select().eq("id", toId(id)).maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return res.data ? rowToTransaction(res.data as TransactionRow) : null;
  }
  async findBySimulation(
    simulationId: string,
    filter?: { agentId?: string; type?: string; day?: number; status?: string; limit?: number },
  ): Promise<Transaction[]> {
    let q = this.db.from("transactions").select().eq("simulation_id", toId(simulationId));
    if (filter?.agentId) {
      const aid = toId(filter.agentId);
      q = q.or(`from_agent_id.eq.${aid},to_agent_id.eq.${aid}`);
    }
    if (filter?.type) q = q.eq("type", filter.type);
    if (filter?.day !== undefined) q = q.eq("game_day", filter.day);
    // Filters on the blockchain_status generated column (see migration) —
    // avoids a full jsonb scan for `blockchain.status`.
    if (filter?.status) q = q.eq("blockchain_status", filter.status);
    q = q.order("created_at", { ascending: false });
    if (filter?.limit) q = q.limit(filter.limit);
    return unwrapList<TransactionRow>(await q).map(rowToTransaction);
  }
  async update(id: string, patch: Partial<Omit<Transaction, "id" | "createdAt">>): Promise<Transaction> {
    const res = await this.db.from("transactions").update(transactionToRow(patch)).eq("id", toId(id)).select().single();
    return rowToTransaction(unwrap<TransactionRow>(res));
  }
}

// ----------------------------------------------------------------- loans --
interface LoanRow {
  id: number;
  simulation_id: number;
  agent_id: number;
  principal: number;
  outstanding_principal: number;
  interest_rate_bps: number;
  interest_amount: number;
  total_repayment: number;
  collateral_property_id: number | null;
  status: Loan["status"];
  issued_day: number;
  due_day: number;
  blockchain: Loan["blockchain"];
  created_at: string;
  updated_at: string;
}
function rowToLoan(r: LoanRow): Loan {
  return {
    id: fromId(r.id),
    simulationId: fromId(r.simulation_id),
    agentId: fromId(r.agent_id),
    principal: Number(r.principal),
    outstandingPrincipal: Number(r.outstanding_principal),
    interestRateBps: r.interest_rate_bps,
    interestAmount: Number(r.interest_amount),
    totalRepayment: Number(r.total_repayment),
    collateralPropertyId: fromIdOrNull(r.collateral_property_id),
    status: r.status,
    issuedDay: r.issued_day,
    dueDay: r.due_day,
    blockchain: r.blockchain,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function loanToRow(l: Partial<Omit<Loan, "id" | "createdAt">>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (l.simulationId !== undefined) row.simulation_id = toId(l.simulationId);
  if (l.agentId !== undefined) row.agent_id = toId(l.agentId);
  setIfDefined(row, "principal", l.principal);
  setIfDefined(row, "outstanding_principal", l.outstandingPrincipal);
  setIfDefined(row, "interest_rate_bps", l.interestRateBps);
  setIfDefined(row, "interest_amount", l.interestAmount);
  setIfDefined(row, "total_repayment", l.totalRepayment);
  if (l.collateralPropertyId !== undefined) row.collateral_property_id = toIdOrNull(l.collateralPropertyId);
  setIfDefined(row, "status", l.status);
  setIfDefined(row, "issued_day", l.issuedDay);
  setIfDefined(row, "due_day", l.dueDay);
  setIfDefined(row, "blockchain", l.blockchain);
  return row;
}

class SupabaseLoanRepository implements LoanRepository {
  constructor(private db: SupabaseClient) {}

  async create(loan: Omit<Loan, "id" | "createdAt" | "updatedAt">): Promise<Loan> {
    const res = await this.db.from("loans").insert(loanToRow(loan)).select().single();
    return rowToLoan(unwrap<LoanRow>(res));
  }
  async findById(id: string): Promise<Loan | null> {
    const res = await this.db.from("loans").select().eq("id", toId(id)).maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return res.data ? rowToLoan(res.data as LoanRow) : null;
  }
  async findBySimulation(simulationId: string): Promise<Loan[]> {
    const res = await this.db.from("loans").select().eq("simulation_id", toId(simulationId));
    return unwrapList<LoanRow>(res).map(rowToLoan);
  }
  async findByAgent(agentId: string): Promise<Loan[]> {
    const res = await this.db.from("loans").select().eq("agent_id", toId(agentId));
    return unwrapList<LoanRow>(res).map(rowToLoan);
  }
  async update(id: string, patch: Partial<Omit<Loan, "id" | "createdAt">>): Promise<Loan> {
    const res = await this.db.from("loans").update(loanToRow(patch)).eq("id", toId(id)).select().single();
    return rowToLoan(unwrap<LoanRow>(res));
  }
}

// ---------------------------------------------------------------- events --
interface EventRow {
  id: number;
  simulation_id: number;
  game_day: number;
  type: SimulationEvent["type"];
  agent_ids: number[];
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
function rowToEvent(r: EventRow): SimulationEvent {
  return {
    id: fromId(r.id),
    simulationId: fromId(r.simulation_id),
    gameDay: r.game_day,
    type: r.type,
    agentIds: r.agent_ids.map(fromId),
    message: r.message,
    metadata: r.metadata,
    createdAt: r.created_at,
  };
}

class SupabaseEventRepository implements EventRepository {
  constructor(private db: SupabaseClient) {}

  async create(event: Omit<SimulationEvent, "id" | "createdAt">): Promise<SimulationEvent> {
    const res = await this.db
      .from("events")
      .insert({
        simulation_id: toId(event.simulationId),
        game_day: event.gameDay,
        type: event.type,
        agent_ids: event.agentIds.map(toId),
        message: event.message,
        metadata: event.metadata,
      })
      .select()
      .single();
    return rowToEvent(unwrap<EventRow>(res));
  }
  async findBySimulation(
    simulationId: string,
    filter?: { day?: number; type?: string; limit?: number },
  ): Promise<SimulationEvent[]> {
    let q = this.db.from("events").select().eq("simulation_id", toId(simulationId));
    if (filter?.day !== undefined) q = q.eq("game_day", filter.day);
    if (filter?.type) q = q.eq("type", filter.type);
    q = q.order("created_at", { ascending: false });
    if (filter?.limit) q = q.limit(filter.limit);
    return unwrapList<EventRow>(await q).map(rowToEvent);
  }
}

// -------------------------------------------------------- agent_decisions -
interface AgentDecisionRow {
  id: number;
  simulation_id: number;
  agent_id: number;
  game_day: number;
  available_actions: string[];
  selected_action: AgentDecisionRecord["selectedAction"];
  source: AgentDecisionRecord["source"];
  model: string | null;
  prompt_version: string;
  created_at: string;
}
function rowToAgentDecision(r: AgentDecisionRow): AgentDecisionRecord {
  return {
    id: fromId(r.id),
    simulationId: fromId(r.simulation_id),
    agentId: fromId(r.agent_id),
    gameDay: r.game_day,
    availableActions: r.available_actions,
    selectedAction: r.selected_action,
    source: r.source,
    model: r.model,
    promptVersion: r.prompt_version,
    createdAt: r.created_at,
  };
}

class SupabaseAgentDecisionRepository implements AgentDecisionRepository {
  constructor(private db: SupabaseClient) {}

  async create(decision: Omit<AgentDecisionRecord, "id" | "createdAt">): Promise<AgentDecisionRecord> {
    const res = await this.db
      .from("agent_decisions")
      .insert({
        simulation_id: toId(decision.simulationId),
        agent_id: toId(decision.agentId),
        game_day: decision.gameDay,
        available_actions: decision.availableActions,
        selected_action: decision.selectedAction,
        source: decision.source,
        model: decision.model,
        prompt_version: decision.promptVersion,
      })
      .select()
      .single();
    return rowToAgentDecision(unwrap<AgentDecisionRow>(res));
  }
  async findBySimulation(
    simulationId: string,
    filter?: { agentId?: string; day?: number },
  ): Promise<AgentDecisionRecord[]> {
    let q = this.db.from("agent_decisions").select().eq("simulation_id", toId(simulationId));
    if (filter?.agentId) q = q.eq("agent_id", toId(filter.agentId));
    if (filter?.day !== undefined) q = q.eq("game_day", filter.day);
    return unwrapList<AgentDecisionRow>(await q).map(rowToAgentDecision);
  }
}

export function createSupabaseRepositories(url: string, serviceRoleKey: string): Repositories {
  const db = getSupabaseAdminClient(url, serviceRoleKey);
  return {
    users: new SupabaseUserRepository(db),
    agents: new SupabaseAgentRepository(db),
    simulations: new SupabaseSimulationRepository(db),
    businesses: new SupabaseBusinessRepository(db),
    properties: new SupabasePropertyRepository(db),
    transactions: new SupabaseTransactionRepository(db),
    loans: new SupabaseLoanRepository(db),
    events: new SupabaseEventRepository(db),
    decisions: new SupabaseAgentDecisionRepository(db),
  };
}
