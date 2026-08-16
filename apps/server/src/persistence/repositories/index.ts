// Repository interfaces — one per collection in docs/database.md §2.
//
// This is the seam the MongoDB dev implements against. Anything in
// `apps/server/src/persistence/memory/` is a drop-in, in-process
// implementation of these same interfaces so the rest of the app can run
// today without a database. `apps/server/src/persistence/mongo/` is the
// stub they fill in — same interfaces, real `mongodb`/`mongoose` driver
// underneath. Nothing outside `persistence/` should import a concrete
// implementation directly; always go through `Repositories`.

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

export interface UserRepository {
  create(user: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByAuthUserId(authUserId: string): Promise<User | null>;
}

export interface AgentRepository {
  create(agent: Omit<Agent, "id" | "createdAt" | "updatedAt">): Promise<Agent>;
  findById(id: string): Promise<Agent | null>;
  findBySimulation(simulationId: string): Promise<Agent[]>;
  findByUserAndSimulation(userId: string, simulationId: string): Promise<Agent | null>;
  update(id: string, patch: Partial<Omit<Agent, "id" | "createdAt">>): Promise<Agent>;
}

export interface SimulationRepository {
  create(simulation: Omit<Simulation, "id" | "createdAt">): Promise<Simulation>;
  findById(id: string): Promise<Simulation | null>;
  list(): Promise<Simulation[]>;
  update(id: string, patch: Partial<Omit<Simulation, "id" | "createdAt">>): Promise<Simulation>;
}

export interface BusinessRepository {
  create(business: Omit<Business, "id" | "createdAt" | "updatedAt">): Promise<Business>;
  findById(id: string): Promise<Business | null>;
  findBySimulation(simulationId: string, filter?: { type?: string; ownerId?: string; status?: string }): Promise<Business[]>;
  update(id: string, patch: Partial<Omit<Business, "id" | "createdAt">>): Promise<Business>;
}

export interface PropertyRepository {
  create(property: Omit<Property, "id" | "createdAt" | "updatedAt">): Promise<Property>;
  findById(id: string): Promise<Property | null>;
  findBySimulation(simulationId: string): Promise<Property[]>;
  findByOwner(ownerAgentId: string): Promise<Property[]>;
  update(id: string, patch: Partial<Omit<Property, "id" | "createdAt">>): Promise<Property>;
}

export interface TransactionRepository {
  create(tx: Omit<Transaction, "id" | "createdAt">): Promise<Transaction>;
  findById(id: string): Promise<Transaction | null>;
  findBySimulation(
    simulationId: string,
    filter?: { agentId?: string; type?: string; day?: number; status?: string; limit?: number },
  ): Promise<Transaction[]>;
  update(id: string, patch: Partial<Omit<Transaction, "id" | "createdAt">>): Promise<Transaction>;
}

export interface LoanRepository {
  create(loan: Omit<Loan, "id" | "createdAt" | "updatedAt">): Promise<Loan>;
  findById(id: string): Promise<Loan | null>;
  findBySimulation(simulationId: string): Promise<Loan[]>;
  findByAgent(agentId: string): Promise<Loan[]>;
  update(id: string, patch: Partial<Omit<Loan, "id" | "createdAt">>): Promise<Loan>;
}

export interface EventRepository {
  create(event: Omit<SimulationEvent, "id" | "createdAt">): Promise<SimulationEvent>;
  findBySimulation(
    simulationId: string,
    filter?: { day?: number; type?: string; limit?: number },
  ): Promise<SimulationEvent[]>;
}

export interface AgentDecisionRepository {
  create(decision: Omit<AgentDecisionRecord, "id" | "createdAt">): Promise<AgentDecisionRecord>;
  findBySimulation(simulationId: string, filter?: { agentId?: string; day?: number }): Promise<AgentDecisionRecord[]>;
}

export interface Repositories {
  users: UserRepository;
  agents: AgentRepository;
  simulations: SimulationRepository;
  businesses: BusinessRepository;
  properties: PropertyRepository;
  transactions: TransactionRepository;
  loans: LoanRepository;
  events: EventRepository;
  decisions: AgentDecisionRepository;
}
