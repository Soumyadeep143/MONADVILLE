// MongoDB implementation of the Repositories seam (../repositories) — one
// collection per interface, matching docs/database.md §2's collection list.
// Domain objects are stored close to as-is (Mongo is schemaless, so nested
// fields like personality/economic/state/employees/blockchain/metrics need
// no jsonb-style flattening the way the Postgres/Supabase driver needs).
// The only conversion at the boundary is the id: Mongo's own `_id`
// (ObjectId) maps to/from the interfaces' `string` id; every other
// id-shaped field (userId, simulationId, ownerAgentId, ...) is stored as a
// plain string — the same hex string `_id.toHexString()` produces — so
// cross-collection lookups are a normal string equality filter, no casting.
//
// Every listing query below sorts explicitly (by `_id`, or `createdAt` with
// `_id` as a tie-break) even where the interface doesn't require an order.
// The in-memory driver's Map-backed Collection always returns insertion
// order "for free" (JS Map iteration order), and economy code implicitly
// relies on that stable order for tie-breaking (e.g. Bertrand pricing's
// "cheapest competitor, first in list wins a tie"). Mongo's `find()` with no
// sort makes no ordering guarantee at all — leaving these unsorted caused
// real, reproducible divergence between two runs of the same seed (caught
// via flow.md §15 replay against this driver, not by the in-memory-only
// unit tests). `_id` is monotonic per insert (timestamp + counter), so
// sorting by it reproduces the same effective order the in-memory driver
// gives.
import { MongoClient, ObjectId, type Db, type WithId } from "mongodb";
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

function now(): string {
  return new Date().toISOString();
}

function toObjectId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new Error(`Not a valid Mongo id: ${id}`);
  return new ObjectId(id);
}

function toDomain<T>(doc: WithId<Omit<T, "id">>): T {
  const { _id, ...rest } = doc;
  return { id: _id.toHexString(), ...rest } as unknown as T;
}

async function findById<T>(db: Db, collection: string, id: string): Promise<T | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await db.collection(collection).findOne({ _id: toObjectId(id) });
  return doc ? toDomain<T>(doc as WithId<Omit<T, "id">>) : null;
}

async function insert<T>(db: Db, collection: string, data: Record<string, unknown>): Promise<T> {
  const res = await db.collection(collection).insertOne(data);
  return toDomain<T>({ _id: res.insertedId, ...data } as WithId<Omit<T, "id">>);
}

async function update<T>(db: Db, collection: string, id: string, patch: Record<string, unknown>): Promise<T> {
  const doc = await db.collection(collection).findOneAndUpdate({ _id: toObjectId(id) }, { $set: patch }, { returnDocument: "after" });
  if (!doc) throw new Error(`${collection} ${id} not found`);
  return toDomain<T>(doc as WithId<Omit<T, "id">>);
}

class MongoUserRepository implements UserRepository {
  constructor(private db: Db) {}
  async create(user: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User> {
    return insert<User>(this.db, "users", { ...user, createdAt: now(), updatedAt: now() });
  }
  findById(id: string): Promise<User | null> {
    return findById<User>(this.db, "users", id);
  }
  async findByAuthUserId(authUserId: string): Promise<User | null> {
    const doc = await this.db.collection("users").findOne({ authUserId });
    return doc ? toDomain<User>(doc as WithId<Omit<User, "id">>) : null;
  }
}

class MongoAgentRepository implements AgentRepository {
  constructor(private db: Db) {}
  async create(agent: Omit<Agent, "id" | "createdAt" | "updatedAt">): Promise<Agent> {
    return insert<Agent>(this.db, "agents", { ...agent, createdAt: now(), updatedAt: now() });
  }
  findById(id: string): Promise<Agent | null> {
    return findById<Agent>(this.db, "agents", id);
  }
  async findBySimulation(simulationId: string): Promise<Agent[]> {
    const docs = await this.db.collection("agents").find({ simulationId }).sort({ _id: 1 }).toArray();
    return docs.map((d) => toDomain<Agent>(d as WithId<Omit<Agent, "id">>));
  }
  async findByUserAndSimulation(userId: string, simulationId: string): Promise<Agent | null> {
    const doc = await this.db.collection("agents").findOne({ userId, simulationId });
    return doc ? toDomain<Agent>(doc as WithId<Omit<Agent, "id">>) : null;
  }
  async update(id: string, patch: Partial<Omit<Agent, "id" | "createdAt">>): Promise<Agent> {
    return update<Agent>(this.db, "agents", id, { ...patch, updatedAt: now() });
  }
}

class MongoSimulationRepository implements SimulationRepository {
  constructor(private db: Db) {}
  async create(simulation: Omit<Simulation, "id" | "createdAt">): Promise<Simulation> {
    return insert<Simulation>(this.db, "simulations", { ...simulation, createdAt: now() });
  }
  findById(id: string): Promise<Simulation | null> {
    return findById<Simulation>(this.db, "simulations", id);
  }
  async list(): Promise<Simulation[]> {
    const docs = await this.db.collection("simulations").find({}).sort({ createdAt: -1 }).toArray();
    return docs.map((d) => toDomain<Simulation>(d as WithId<Omit<Simulation, "id">>));
  }
  async update(id: string, patch: Partial<Omit<Simulation, "id" | "createdAt">>): Promise<Simulation> {
    return update<Simulation>(this.db, "simulations", id, patch);
  }
}

class MongoBusinessRepository implements BusinessRepository {
  constructor(private db: Db) {}
  async create(business: Omit<Business, "id" | "createdAt" | "updatedAt">): Promise<Business> {
    return insert<Business>(this.db, "businesses", { ...business, createdAt: now(), updatedAt: now() });
  }
  findById(id: string): Promise<Business | null> {
    return findById<Business>(this.db, "businesses", id);
  }
  async findBySimulation(simulationId: string, filter?: { type?: string; ownerId?: string; status?: string }): Promise<Business[]> {
    const query: Record<string, unknown> = { simulationId };
    if (filter?.type) query.type = filter.type;
    if (filter?.ownerId) query.ownerAgentId = filter.ownerId;
    if (filter?.status) query.status = filter.status;
    const docs = await this.db.collection("businesses").find(query).sort({ _id: 1 }).toArray();
    return docs.map((d) => toDomain<Business>(d as WithId<Omit<Business, "id">>));
  }
  async update(id: string, patch: Partial<Omit<Business, "id" | "createdAt">>): Promise<Business> {
    return update<Business>(this.db, "businesses", id, { ...patch, updatedAt: now() });
  }
}

class MongoPropertyRepository implements PropertyRepository {
  constructor(private db: Db) {}
  async create(property: Omit<Property, "id" | "createdAt" | "updatedAt">): Promise<Property> {
    return insert<Property>(this.db, "properties", { ...property, createdAt: now(), updatedAt: now() });
  }
  findById(id: string): Promise<Property | null> {
    return findById<Property>(this.db, "properties", id);
  }
  async findBySimulation(simulationId: string): Promise<Property[]> {
    const docs = await this.db.collection("properties").find({ simulationId }).sort({ _id: 1 }).toArray();
    return docs.map((d) => toDomain<Property>(d as WithId<Omit<Property, "id">>));
  }
  async findByOwner(ownerAgentId: string): Promise<Property[]> {
    const docs = await this.db.collection("properties").find({ ownerAgentId }).sort({ _id: 1 }).toArray();
    return docs.map((d) => toDomain<Property>(d as WithId<Omit<Property, "id">>));
  }
  async update(id: string, patch: Partial<Omit<Property, "id" | "createdAt">>): Promise<Property> {
    return update<Property>(this.db, "properties", id, { ...patch, updatedAt: now() });
  }
}

class MongoTransactionRepository implements TransactionRepository {
  constructor(private db: Db) {}
  async create(tx: Omit<Transaction, "id" | "createdAt">): Promise<Transaction> {
    return insert<Transaction>(this.db, "transactions", { ...tx, createdAt: now() });
  }
  findById(id: string): Promise<Transaction | null> {
    return findById<Transaction>(this.db, "transactions", id);
  }
  async findBySimulation(
    simulationId: string,
    filter?: { agentId?: string; type?: string; day?: number; status?: string; limit?: number },
  ): Promise<Transaction[]> {
    const query: Record<string, unknown> = { simulationId };
    if (filter?.agentId) query.$or = [{ fromAgentId: filter.agentId }, { toAgentId: filter.agentId }];
    if (filter?.type) query.type = filter.type;
    if (filter?.day !== undefined) query.gameDay = filter.day;
    if (filter?.status) query["blockchain.status"] = filter.status;
    let cursor = this.db.collection("transactions").find(query).sort({ createdAt: -1, _id: -1 });
    if (filter?.limit) cursor = cursor.limit(filter.limit);
    const docs = await cursor.toArray();
    return docs.map((d) => toDomain<Transaction>(d as WithId<Omit<Transaction, "id">>));
  }
  async update(id: string, patch: Partial<Omit<Transaction, "id" | "createdAt">>): Promise<Transaction> {
    return update<Transaction>(this.db, "transactions", id, patch);
  }
}

class MongoLoanRepository implements LoanRepository {
  constructor(private db: Db) {}
  async create(loan: Omit<Loan, "id" | "createdAt" | "updatedAt">): Promise<Loan> {
    return insert<Loan>(this.db, "loans", { ...loan, createdAt: now(), updatedAt: now() });
  }
  findById(id: string): Promise<Loan | null> {
    return findById<Loan>(this.db, "loans", id);
  }
  async findBySimulation(simulationId: string): Promise<Loan[]> {
    const docs = await this.db.collection("loans").find({ simulationId }).sort({ _id: 1 }).toArray();
    return docs.map((d) => toDomain<Loan>(d as WithId<Omit<Loan, "id">>));
  }
  async findByAgent(agentId: string): Promise<Loan[]> {
    const docs = await this.db.collection("loans").find({ agentId }).sort({ _id: 1 }).toArray();
    return docs.map((d) => toDomain<Loan>(d as WithId<Omit<Loan, "id">>));
  }
  async update(id: string, patch: Partial<Omit<Loan, "id" | "createdAt">>): Promise<Loan> {
    return update<Loan>(this.db, "loans", id, { ...patch, updatedAt: now() });
  }
}

class MongoEventRepository implements EventRepository {
  constructor(private db: Db) {}
  async create(event: Omit<SimulationEvent, "id" | "createdAt">): Promise<SimulationEvent> {
    return insert<SimulationEvent>(this.db, "events", { ...event, createdAt: now() });
  }
  async findBySimulation(simulationId: string, filter?: { day?: number; type?: string; limit?: number }): Promise<SimulationEvent[]> {
    const query: Record<string, unknown> = { simulationId };
    if (filter?.day !== undefined) query.gameDay = filter.day;
    if (filter?.type) query.type = filter.type;
    let cursor = this.db.collection("events").find(query).sort({ createdAt: -1, _id: -1 });
    if (filter?.limit) cursor = cursor.limit(filter.limit);
    const docs = await cursor.toArray();
    return docs.map((d) => toDomain<SimulationEvent>(d as WithId<Omit<SimulationEvent, "id">>));
  }
}

class MongoAgentDecisionRepository implements AgentDecisionRepository {
  constructor(private db: Db) {}
  async create(decision: Omit<AgentDecisionRecord, "id" | "createdAt">): Promise<AgentDecisionRecord> {
    return insert<AgentDecisionRecord>(this.db, "agent_decisions", { ...decision, createdAt: now() });
  }
  async findBySimulation(simulationId: string, filter?: { agentId?: string; day?: number }): Promise<AgentDecisionRecord[]> {
    const query: Record<string, unknown> = { simulationId };
    if (filter?.agentId) query.agentId = filter.agentId;
    if (filter?.day !== undefined) query.gameDay = filter.day;
    const docs = await this.db.collection("agent_decisions").find(query).sort({ _id: 1 }).toArray();
    return docs.map((d) => toDomain<AgentDecisionRecord>(d as WithId<Omit<AgentDecisionRecord, "id">>));
  }
}

let client: MongoClient | null = null;

export async function createMongoRepositories(connectionUri: string): Promise<Repositories> {
  if (!connectionUri) {
    throw new Error("PERSISTENCE_DRIVER=mongo requires MONGODB_URI to be set.");
  }
  if (!client) {
    client = new MongoClient(connectionUri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
  }
  const db = client.db();

  // Indexes matching the lookups every repository above actually performs —
  // safe to call on every boot (createIndex is a no-op if it already
  // exists with the same spec).
  await Promise.all([
    db.collection("users").createIndex({ authUserId: 1 }, { unique: true }),
    db.collection("agents").createIndex({ simulationId: 1 }),
    db.collection("agents").createIndex({ userId: 1, simulationId: 1 }),
    db.collection("simulations").createIndex({ createdAt: -1 }),
    db.collection("businesses").createIndex({ simulationId: 1 }),
    db.collection("properties").createIndex({ simulationId: 1 }),
    db.collection("properties").createIndex({ ownerAgentId: 1 }),
    db.collection("transactions").createIndex({ simulationId: 1, createdAt: -1 }),
    db.collection("loans").createIndex({ simulationId: 1 }),
    db.collection("loans").createIndex({ agentId: 1 }),
    db.collection("events").createIndex({ simulationId: 1, createdAt: -1 }),
    db.collection("agent_decisions").createIndex({ simulationId: 1 }),
  ]);

  return {
    users: new MongoUserRepository(db),
    agents: new MongoAgentRepository(db),
    simulations: new MongoSimulationRepository(db),
    businesses: new MongoBusinessRepository(db),
    properties: new MongoPropertyRepository(db),
    transactions: new MongoTransactionRepository(db),
    loans: new MongoLoanRepository(db),
    events: new MongoEventRepository(db),
    decisions: new MongoAgentDecisionRepository(db),
  };
}
