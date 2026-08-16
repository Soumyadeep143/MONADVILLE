// In-process implementation of the Repositories seam (persistence/repositories).
// This is what apps/server runs against by default (PERSISTENCE_DRIVER=memory).
// The MongoDB dev replaces this with persistence/mongo/* — same interfaces.

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
import { Collection } from "./collection.js";

function now(): string {
  return new Date().toISOString();
}

class InMemoryUserRepository implements UserRepository {
  private col = new Collection<User>();

  async create(user: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User> {
    return this.col.insert({ ...user, createdAt: now(), updatedAt: now() });
  }
  async findById(id: string): Promise<User | null> {
    return this.col.get(id);
  }
  async findByAuthUserId(authUserId: string): Promise<User | null> {
    return this.col.findOne((u) => u.authUserId === authUserId);
  }
}

class InMemoryAgentRepository implements AgentRepository {
  private col = new Collection<Agent>();

  async create(agent: Omit<Agent, "id" | "createdAt" | "updatedAt">): Promise<Agent> {
    return this.col.insert({ ...agent, createdAt: now(), updatedAt: now() });
  }
  async findById(id: string): Promise<Agent | null> {
    return this.col.get(id);
  }
  async findBySimulation(simulationId: string): Promise<Agent[]> {
    return this.col.find((a) => a.simulationId === simulationId);
  }
  async findByUserAndSimulation(userId: string, simulationId: string): Promise<Agent | null> {
    return this.col.findOne((a) => a.userId === userId && a.simulationId === simulationId);
  }
  async update(id: string, patch: Partial<Omit<Agent, "id" | "createdAt">>): Promise<Agent> {
    return this.col.update(id, { ...patch, updatedAt: now() } as Partial<Agent>);
  }
}

class InMemorySimulationRepository implements SimulationRepository {
  private col = new Collection<Simulation>();

  async create(simulation: Omit<Simulation, "id" | "createdAt">): Promise<Simulation> {
    return this.col.insert({ ...simulation, createdAt: now() });
  }
  async findById(id: string): Promise<Simulation | null> {
    return this.col.get(id);
  }
  async list(): Promise<Simulation[]> {
    return this.col.all();
  }
  async update(id: string, patch: Partial<Omit<Simulation, "id" | "createdAt">>): Promise<Simulation> {
    return this.col.update(id, patch as Partial<Simulation>);
  }
}

class InMemoryBusinessRepository implements BusinessRepository {
  private col = new Collection<Business>();

  async create(business: Omit<Business, "id" | "createdAt" | "updatedAt">): Promise<Business> {
    return this.col.insert({ ...business, createdAt: now(), updatedAt: now() });
  }
  async findById(id: string): Promise<Business | null> {
    return this.col.get(id);
  }
  async findBySimulation(
    simulationId: string,
    filter?: { type?: string; ownerId?: string; status?: string },
  ): Promise<Business[]> {
    return this.col.find(
      (b) =>
        b.simulationId === simulationId &&
        (!filter?.type || b.type === filter.type) &&
        (!filter?.ownerId || b.ownerAgentId === filter.ownerId) &&
        (!filter?.status || b.status === filter.status),
    );
  }
  async update(id: string, patch: Partial<Omit<Business, "id" | "createdAt">>): Promise<Business> {
    return this.col.update(id, { ...patch, updatedAt: now() } as Partial<Business>);
  }
}

class InMemoryPropertyRepository implements PropertyRepository {
  private col = new Collection<Property>();

  async create(property: Omit<Property, "id" | "createdAt" | "updatedAt">): Promise<Property> {
    return this.col.insert({ ...property, createdAt: now(), updatedAt: now() });
  }
  async findById(id: string): Promise<Property | null> {
    return this.col.get(id);
  }
  async findBySimulation(simulationId: string): Promise<Property[]> {
    return this.col.find((p) => p.simulationId === simulationId);
  }
  async findByOwner(ownerAgentId: string): Promise<Property[]> {
    return this.col.find((p) => p.ownerAgentId === ownerAgentId);
  }
  async update(id: string, patch: Partial<Omit<Property, "id" | "createdAt">>): Promise<Property> {
    return this.col.update(id, { ...patch, updatedAt: now() } as Partial<Property>);
  }
}

class InMemoryTransactionRepository implements TransactionRepository {
  private col = new Collection<Transaction>();

  async create(tx: Omit<Transaction, "id" | "createdAt">): Promise<Transaction> {
    return this.col.insert({ ...tx, createdAt: now() });
  }
  async findById(id: string): Promise<Transaction | null> {
    return this.col.get(id);
  }
  async findBySimulation(
    simulationId: string,
    filter?: { agentId?: string; type?: string; day?: number; status?: string; limit?: number },
  ): Promise<Transaction[]> {
    let rows = this.col.find(
      (t) =>
        t.simulationId === simulationId &&
        (!filter?.agentId || t.fromAgentId === filter.agentId || t.toAgentId === filter.agentId) &&
        (!filter?.type || t.type === filter.type) &&
        (filter?.day === undefined || t.gameDay === filter.day) &&
        (!filter?.status || t.blockchain.status === filter.status),
    );
    rows = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filter?.limit ? rows.slice(0, filter.limit) : rows;
  }
  async update(id: string, patch: Partial<Omit<Transaction, "id" | "createdAt">>): Promise<Transaction> {
    return this.col.update(id, patch as Partial<Transaction>);
  }
}

class InMemoryLoanRepository implements LoanRepository {
  private col = new Collection<Loan>();

  async create(loan: Omit<Loan, "id" | "createdAt" | "updatedAt">): Promise<Loan> {
    return this.col.insert({ ...loan, createdAt: now(), updatedAt: now() });
  }
  async findById(id: string): Promise<Loan | null> {
    return this.col.get(id);
  }
  async findBySimulation(simulationId: string): Promise<Loan[]> {
    return this.col.find((l) => l.simulationId === simulationId);
  }
  async findByAgent(agentId: string): Promise<Loan[]> {
    return this.col.find((l) => l.agentId === agentId);
  }
  async update(id: string, patch: Partial<Omit<Loan, "id" | "createdAt">>): Promise<Loan> {
    return this.col.update(id, { ...patch, updatedAt: now() } as Partial<Loan>);
  }
}

class InMemoryEventRepository implements EventRepository {
  private col = new Collection<SimulationEvent>();

  async create(event: Omit<SimulationEvent, "id" | "createdAt">): Promise<SimulationEvent> {
    return this.col.insert({ ...event, createdAt: now() });
  }
  async findBySimulation(
    simulationId: string,
    filter?: { day?: number; type?: string; limit?: number },
  ): Promise<SimulationEvent[]> {
    let rows = this.col.find(
      (e) =>
        e.simulationId === simulationId &&
        (filter?.day === undefined || e.gameDay === filter.day) &&
        (!filter?.type || e.type === filter.type),
    );
    rows = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filter?.limit ? rows.slice(0, filter.limit) : rows;
  }
}

class InMemoryAgentDecisionRepository implements AgentDecisionRepository {
  private col = new Collection<AgentDecisionRecord>();

  async create(decision: Omit<AgentDecisionRecord, "id" | "createdAt">): Promise<AgentDecisionRecord> {
    return this.col.insert({ ...decision, createdAt: now() });
  }
  async findBySimulation(
    simulationId: string,
    filter?: { agentId?: string; day?: number },
  ): Promise<AgentDecisionRecord[]> {
    return this.col.find(
      (d) =>
        d.simulationId === simulationId &&
        (!filter?.agentId || d.agentId === filter.agentId) &&
        (filter?.day === undefined || d.gameDay === filter.day),
    );
  }
}

export function createInMemoryRepositories(): Repositories {
  return {
    users: new InMemoryUserRepository(),
    agents: new InMemoryAgentRepository(),
    simulations: new InMemorySimulationRepository(),
    businesses: new InMemoryBusinessRepository(),
    properties: new InMemoryPropertyRepository(),
    transactions: new InMemoryTransactionRepository(),
    loans: new InMemoryLoanRepository(),
    events: new InMemoryEventRepository(),
    decisions: new InMemoryAgentDecisionRepository(),
  };
}
