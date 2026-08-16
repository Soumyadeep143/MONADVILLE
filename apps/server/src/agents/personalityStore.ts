import type { Personality } from "@econforge/shared";

// Bridges questionnaire submission -> simulation creation. prd.md's flow
// treats "derive personality" and "join a simulation" as separate steps,
// but docs/database.md only persists personality on the per-simulation
// Agent document (there's no standalone profile collection). This in-memory
// cache is the missing link for this pass; whoever adds real Mongo
// persistence can replace it with a `profiles` collection without touching
// anything downstream — callers only ever go through get/set here.
const cache = new Map<string, Personality>();

export function setCachedPersonality(userId: string, personality: Personality): void {
  cache.set(userId, personality);
}

export function getCachedPersonality(userId: string): Personality | null {
  return cache.get(userId) ?? null;
}
