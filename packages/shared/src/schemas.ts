import { z } from "zod";

// Structured LLM decision output. The LLM never invents an action, target,
// or amount — it only selects the id of one of the candidate options the
// deterministic engine already generated (decisionEngine.ts resolves the id
// back to that exact candidate). This is the whole gate: there is no field
// here the model could use to smuggle in an action outside that list.
export const llmDecisionSchema = z.object({
  selectedOptionId: z.string().min(1),
  reasonCode: z.string().min(1).max(64),
});
export type LlmDecisionOutput = z.infer<typeof llmDecisionSchema>;

export const questionnaireAnswerSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1),
});

export const questionnaireSubmitSchema = z.object({
  version: z.string().min(1),
  answers: z.array(questionnaireAnswerSchema).min(1),
});
export type QuestionnaireSubmitInput = z.infer<typeof questionnaireSubmitSchema>;

export const decisionPolicySchema = z.enum(["LLM", "PERSONALITY", "RANDOM", "RATIONAL"]);

export const rulesOverrideSchema = z
  .object({
    transactionTaxBps: z.number().int().min(0).max(2000),
    workerWage: z.number().positive(),
    loanMaxPercentBps: z.number().int().min(0).max(10000),
    loanInterestBps: z.number().int().min(0).max(5000),
    loanDurationDays: z.number().int().positive(),
    businessWorkers: z.number().int().positive(),
  })
  .partial();

export const createSimulationSchema = z.object({
  name: z.string().min(1).max(120),
  durationDays: z.number().int().min(1).max(365).optional(),
  agentIds: z.array(z.string().min(1)).min(1),
  /** prd.md §22 experiment mode. Defaults to "LLM" (Groq, falling back to PERSONALITY on failure). */
  decisionPolicy: decisionPolicySchema.optional(),
  /** Per-simulation overrides of the default rules — see docs/prd.md §22 "tax-rate comparison" / "loan-policy comparison". */
  rulesOverride: rulesOverrideSchema.optional(),
});
export type CreateSimulationInput = z.infer<typeof createSimulationSchema>;
