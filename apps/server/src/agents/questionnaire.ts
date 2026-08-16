import type { Personality } from "@econforge/shared";

export interface QuestionOption {
  id: string;
  label: string;
  scores: Partial<Personality>;
}

export interface Question {
  id: string;
  type: "CHOICE";
  text: string;
  options: QuestionOption[];
}

export const QUESTIONNAIRE_VERSION = "v1";

// Scenario questions, not self-labeling (prd.md §6/flow.md §2). Each option
// contributes a 0-100 score to one or more of the five tendencies; scoring
// averages whatever a user's answers touched per trait.
export const QUESTIONNAIRE: Question[] = [
  {
    id: "risk_01",
    type: "CHOICE",
    text: "You have 100 coins. Option A: receive 110 tomorrow with certainty. Option B: 50% chance of 250, 50% chance of 0. Your choice?",
    options: [
      { id: "safe", label: "Guaranteed 110", scores: { risk: 20 } },
      { id: "risky", label: "50% chance of 250", scores: { risk: 85 } },
    ],
  },
  {
    id: "risk_02",
    type: "CHOICE",
    text: "A new business opportunity requires investing half your savings with uncertain returns.",
    options: [
      { id: "invest", label: "Invest in it", scores: { risk: 80, confidence: 70 } },
      { id: "wait", label: "Wait and observe first", scores: { risk: 25, confidence: 30 } },
    ],
  },
  {
    id: "spending_01",
    type: "CHOICE",
    text: "You receive a surprise bonus of 200 coins. What do you do?",
    options: [
      { id: "spend", label: "Spend it on something enjoyable now", scores: { spending: 85 } },
      { id: "save", label: "Save most of it", scores: { spending: 20 } },
    ],
  },
  {
    id: "spending_02",
    type: "CHOICE",
    text: "At the end of a good week, you tend to...",
    options: [
      { id: "treat", label: "Treat yourself to entertainment", scores: { spending: 75, fomo: 40 } },
      { id: "hold", label: "Keep your budget unchanged", scores: { spending: 25 } },
    ],
  },
  {
    id: "ethics_01",
    type: "CHOICE",
    text: "You agreed to pay a worker by Friday but you're short on cash.",
    options: [
      { id: "borrow", label: "Borrow to pay them on time", scores: { ethics: 85 } },
      { id: "delay", label: "Delay payment until you can afford it", scores: { ethics: 30 } },
    ],
  },
  {
    id: "ethics_02",
    type: "CHOICE",
    text: "You found a way to earn more by bending an agreement slightly.",
    options: [
      { id: "honor", label: "Stick to the agreement as made", scores: { ethics: 80 } },
      { id: "bend", label: "Take the extra opportunity", scores: { ethics: 25 } },
    ],
  },
  {
    id: "confidence_01",
    type: "CHOICE",
    text: "Starting a new venture means facing rivals with more experience.",
    options: [
      { id: "go", label: "Go for it — you can compete", scores: { confidence: 85 } },
      { id: "hold_off", label: "Hold off until more prepared", scores: { confidence: 30 } },
    ],
  },
  {
    id: "confidence_02",
    type: "CHOICE",
    text: "In a negotiation over price, you usually...",
    options: [
      { id: "push", label: "Push firmly for better terms", scores: { confidence: 80 } },
      { id: "accept", label: "Accept the first reasonable offer", scores: { confidence: 35 } },
    ],
  },
  {
    id: "fomo_01",
    type: "CHOICE",
    text: "You notice everyone rushing to a newly popular venue.",
    options: [
      { id: "join", label: "Join in right away", scores: { fomo: 85 } },
      { id: "routine", label: "Stick to your usual routine", scores: { fomo: 20 } },
    ],
  },
  {
    id: "fomo_02",
    type: "CHOICE",
    text: "Prices for a trendy good are rising fast.",
    options: [
      { id: "buy_now", label: "Buy now before it goes higher", scores: { fomo: 80, risk: 55 } },
      { id: "wait_settle", label: "Wait for prices to settle", scores: { fomo: 25 } },
    ],
  },
];

const TRAITS: (keyof Personality)[] = ["risk", "spending", "ethics", "confidence", "fomo"];

export function scorePersonality(answers: { questionId: string; optionId: string }[]): Personality {
  const sums: Record<keyof Personality, number> = { risk: 0, spending: 0, ethics: 0, confidence: 0, fomo: 0 };
  const counts: Record<keyof Personality, number> = { risk: 0, spending: 0, ethics: 0, confidence: 0, fomo: 0 };

  for (const answer of answers) {
    const question = QUESTIONNAIRE.find((q) => q.id === answer.questionId);
    const option = question?.options.find((o) => o.id === answer.optionId);
    if (!option) continue;
    for (const trait of TRAITS) {
      const value = option.scores[trait];
      if (value !== undefined) {
        sums[trait] += value;
        counts[trait] += 1;
      }
    }
  }

  const result = {} as Personality;
  for (const trait of TRAITS) {
    result[trait] = counts[trait] > 0 ? Math.round(sums[trait] / counts[trait]) : 50;
  }
  return result;
}
