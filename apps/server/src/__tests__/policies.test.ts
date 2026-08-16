import { describe, it, expect } from "vitest";
import type { Agent, CandidateAction } from "@econforge/shared";
import { STARTING_REPUTATION } from "@econforge/shared";
import { pickRandomAction, pickRationalAction } from "../agents/policies.js";

function makeAgent(): Agent {
  return {
    id: "agent1",
    userId: "user1",
    simulationId: "sim1",
    personality: { risk: 50, spending: 50, ethics: 50, confidence: 50, fomo: 50 },
    economic: { cash: 1000, outstandingDebt: 0, totalBorrowed: 0, totalRepaid: 0, totalInterestPaid: 0, totalIncome: 0, totalExpenses: 0 },
    state: { hunger: 0, employmentStatus: "UNEMPLOYED", employerId: null, propertyIds: [], businessIds: [] },
    reputation: { score: STARTING_REPUTATION, history: [] },
    activity: { score: 0, history: [] },
    statistics: { transactions: 0, theatreVisits: 0, loansTaken: 0, loansRepaid: 0, loansDefaulted: 0, businessesCreated: 0, businessesFailed: 0 },
    memory: [],
    createdAt: "",
    updatedAt: "",
  };
}

const candidates: CandidateAction[] = [
  { id: "choice_1", action: "SAVE", targetId: null, amount: null, description: "save" },
  { id: "choice_2", action: "VISIT_THEATRE", targetId: "t1", amount: 15, description: "theatre" },
  { id: "choice_3", action: "BUY_MEAL", targetId: "r1", amount: 10, description: "meal" },
  { id: "choice_4", action: "TAKE_LOAN", targetId: null, amount: 100, description: "loan" },
];

describe("baseline decision policies", () => {
  it("RANDOM is deterministic given the same (seed, day, agent)", () => {
    const agent = makeAgent();
    const a = pickRandomAction(agent, candidates, 42, 5);
    const b = pickRandomAction(agent, candidates, 42, 5);
    expect(a).toEqual(b);
  });

  it("RANDOM only ever picks a listed candidate", () => {
    const agent = makeAgent();
    for (let day = 0; day < 20; day++) {
      const picked = pickRandomAction(agent, candidates, 7, day);
      expect(candidates.some((c) => c.action === picked.action && c.targetId === picked.targetId)).toBe(true);
    }
  });

  it("RATIONAL always prioritizes hunger over discretionary spending", () => {
    const agent = makeAgent();
    const picked = pickRationalAction(agent, candidates);
    expect(picked.action).toBe("BUY_MEAL");
  });

  it("RATIONAL is personality-independent — same candidates, same pick regardless of traits", () => {
    const riskAverse = { ...makeAgent(), personality: { risk: 5, spending: 5, ethics: 95, confidence: 5, fomo: 5 } };
    const riskSeeking = { ...makeAgent(), personality: { risk: 95, spending: 95, ethics: 5, confidence: 95, fomo: 95 } };
    expect(pickRationalAction(riskAverse, candidates)).toEqual(pickRationalAction(riskSeeking, candidates));
  });
});
