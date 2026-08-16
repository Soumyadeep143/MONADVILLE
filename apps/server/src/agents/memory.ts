import type { Agent, AgentMemoryEntry } from "@econforge/shared";

const MAX_MEMORY_ENTRIES = 5; // stored history depth
const PROMPT_MEMORY_ENTRIES = 2; // how much of it goes into the LLM prompt — keeps token spend down

// database.md §11: "Do not store full chain-of-thought. Store concise
// structured reason codes/decision metadata." Memory here is a short rolling
// summary, not a transcript.
export function appendMemory(agent: Agent, day: number, summary: string): AgentMemoryEntry[] {
  const next = [...agent.memory, { day, summary }];
  return next.slice(-MAX_MEMORY_ENTRIES);
}

export function summarizeMemory(memory: AgentMemoryEntry[]): string {
  if (memory.length === 0) return "none yet";
  return memory
    .slice(-PROMPT_MEMORY_ENTRIES)
    .map((m) => `d${m.day}: ${m.summary}`)
    .join(" | ");
}
