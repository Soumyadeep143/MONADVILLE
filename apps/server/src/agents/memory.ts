import type { Agent, AgentMemoryEntry } from "@econforge/shared";

const MAX_MEMORY_ENTRIES = 5;

// database.md §11: "Do not store full chain-of-thought. Store concise
// structured reason codes/decision metadata." Memory here is a short rolling
// summary, not a transcript.
export function appendMemory(agent: Agent, day: number, summary: string): AgentMemoryEntry[] {
  const next = [...agent.memory, { day, summary }];
  return next.slice(-MAX_MEMORY_ENTRIES);
}

export function summarizeMemory(memory: AgentMemoryEntry[]): string {
  if (memory.length === 0) return "No prior activity.";
  return memory.map((m) => `Day ${m.day}: ${m.summary}`).join("\n");
}
