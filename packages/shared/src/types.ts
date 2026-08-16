// Core domain types, mirrors docs/database.md collection shapes.
// IDs are plain strings so either an in-memory store or Mongo ObjectId.toString()
// can satisfy these types without the rest of the app caring which.

export interface Personality {
  risk: number; // 0-100
  spending: number;
  ethics: number;
  confidence: number;
  fomo: number;
}

export type EmploymentStatus = "UNEMPLOYED" | "EMPLOYED";

export interface EconomicProfile {
  cash: number;
  outstandingDebt: number;
  totalBorrowed: number;
  totalRepaid: number;
  totalInterestPaid: number;
  totalIncome: number;
  totalExpenses: number;
}

export interface AgentRuntimeState {
  hunger: number;
  employmentStatus: EmploymentStatus;
  employerId: string | null;
  propertyIds: string[];
  businessIds: string[];
}

export interface HistoryEntry {
  day: number;
  delta: number;
  reason: string;
  value: number; // value after applying delta
  createdAt: string;
}

export interface ReputationProfile {
  score: number;
  history: HistoryEntry[];
}

export interface ActivityProfile {
  score: number;
  history: HistoryEntry[];
}

export interface AgentStatistics {
  transactions: number;
  theatreVisits: number;
  loansTaken: number;
  loansRepaid: number;
  loansDefaulted: number;
  businessesCreated: number;
  businessesFailed: number;
}

export interface AgentMemoryEntry {
  day: number;
  summary: string;
}

export interface Agent {
  id: string;
  userId: string;
  simulationId: string;
  personality: Personality;
  economic: EconomicProfile;
  state: AgentRuntimeState;
  reputation: ReputationProfile;
  activity: ActivityProfile;
  statistics: AgentStatistics;
  memory: AgentMemoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export function netWorth(agent: Agent, markedAssetValue: number): number {
  return agent.economic.cash + markedAssetValue - agent.economic.outstandingDebt;
}

export type BusinessType = "FARM" | "RESTAURANT" | "THEATRE";
export type BusinessStatus = "ACTIVE" | "INACTIVE" | "FAILED";

export interface BusinessEmployee {
  agentId: string;
  wage: number;
}

export interface BusinessInventory {
  food: number;
  meals: number;
}

export interface BusinessStatistics {
  revenue: number;
  expenses: number;
  profit: number;
  daysActive: number;
  failedDays: number;
}

export interface Business {
  id: string;
  simulationId: string;
  ownerAgentId: string;
  type: BusinessType;
  propertyId: string;
  status: BusinessStatus;
  employees: BusinessEmployee[];
  price: number;
  inventory: BusinessInventory;
  statistics: BusinessStatistics;
  createdAt: string;
  updatedAt: string;
}

export type PropertyType = "LAND" | "FARM" | "RESTAURANT" | "THEATRE";

export interface Property {
  id: string;
  simulationId: string;
  ownerAgentId: string;
  type: PropertyType;
  landValue: number;
  constructionValue: number;
  marketValue: number;
  businessId: string | null;
  /** Listed on the peer-to-peer property market at `marketValue` — see economy/property.ts. */
  forSale: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType =
  | "TRANSFER"
  | "WAGE"
  | "PURCHASE"
  | "PROPERTY"
  | "LOAN"
  | "REPAYMENT"
  | "INTEREST";

export type BlockchainStatus = "PENDING" | "CONFIRMED" | "FAILED";

export interface TransactionBlockchainInfo {
  status: BlockchainStatus;
  txHash: string | null;
  blockNumber: number | null;
}

export interface Transaction {
  id: string;
  simulationId: string;
  type: TransactionType;
  fromAgentId: string | null; // null for treasury/system-originated
  toAgentId: string | null;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
  blockchain: TransactionBlockchainInfo;
  gameDay: number;
  createdAt: string;
}

export type LoanStatus = "ACTIVE" | "REPAID" | "DEFAULTED";

export interface LoanBlockchainInfo {
  creationTxHash: string | null;
  repaymentTxHash: string | null;
}

export interface Loan {
  id: string;
  simulationId: string;
  agentId: string;
  principal: number;
  outstandingPrincipal: number;
  interestRateBps: number;
  interestAmount: number;
  totalRepayment: number;
  collateralPropertyId: string | null;
  status: LoanStatus;
  issuedDay: number;
  dueDay: number;
  blockchain: LoanBlockchainInfo;
  createdAt: string;
  updatedAt: string;
}

export type EventType =
  | "BUSINESS_CREATED"
  | "BUSINESS_FAILED"
  | "LOAN"
  | "REPAYMENT"
  | "DEFAULT"
  | "SHOCK"
  | "TRADE"
  | "THEATRE_VISIT"
  | "DAY_STARTED"
  | "DAY_ENDED"
  | "SIMULATION_COMPLETE";

export interface SimulationEvent {
  id: string;
  simulationId: string;
  gameDay: number;
  type: EventType;
  agentIds: string[];
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type SimulationStatus =
  | "CREATED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED";

export interface SimulationRules {
  startingCash: number;
  transactionTaxBps: number;
  workerWage: number;
  loanMaxPercentBps: number;
  loanInterestBps: number;
  loanDurationDays: number;
  businessWorkers: number;
}

export interface SimulationMetrics {
  gini: number;
  averageWealth: number;
  medianWealth: number;
  top10WealthShare: number;
  treasuryBalance: number;
}

// prd.md §22 "research/experiment mode" baselines. LLM tries Groq and falls
// back to PERSONALITY on any failure (source recorded either way);
// PERSONALITY/RANDOM/RATIONAL never touch the LLM, so a simulation run
// under any of them is fully deterministic given the same seed — required
// for "the same experiment can be repeated using a seed and compared
// statistically" (roadmap.md Phase 9 DoD).
export type DecisionPolicy = "LLM" | "PERSONALITY" | "RANDOM" | "RATIONAL";

export interface Simulation {
  id: string;
  name: string;
  status: SimulationStatus;
  rulesVersion: string;
  promptVersion: string;
  randomSeed: number;
  durationDays: number;
  currentDay: number;
  rules: SimulationRules;
  /** Beyond database.md's documented schema — see docs/prd.md §22. Defaults to "LLM". */
  decisionPolicy: DecisionPolicy;
  metrics: SimulationMetrics;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface User {
  id: string;
  authUserId: string; // Supabase user id in production, dev-id locally
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export type DecisionSource = "LLM" | "PERSONALITY" | "RANDOM" | "RATIONAL";

export interface AgentDecisionRecord {
  id: string;
  simulationId: string;
  agentId: string;
  gameDay: number;
  availableActions: string[];
  selectedAction: {
    action: string;
    targetId: string | null;
    amount: number | null;
    reasonCode: string;
  };
  source: DecisionSource;
  model: string | null;
  promptVersion: string;
  createdAt: string;
}
