import { supabase } from "./supabaseClient.js";

const BASE = "/api/v1";

// Real, server-confirmed identity for a signed-in Supabase user — populated
// once by App.tsx right after auth (via GET /me, which is what actually
// creates/looks up the internal User row keyed by the Supabase auth id).
// Deliberately an in-memory module variable, not localStorage: the one
// piece of client-side persistence this app now has is Supabase's own
// session (see supabaseClient.ts) — we don't keep a second, separate copy
// of who's logged in.
let cachedIdentity: { userId: string; displayName: string } | null = null;

export function setIdentity(userId: string, displayName: string): void {
  cachedIdentity = { userId, displayName };
}

export function clearIdentity(): void {
  cachedIdentity = null;
}

export function getSessionUserId(): string | null {
  return cachedIdentity?.userId ?? null;
}

export function getDisplayName(): string | null {
  return cachedIdentity?.displayName ?? null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => request<{ id: string; displayName: string; agentCount: number }>("/me"),
  getQuestionnaire: () => request<{ version: string; questions: { id: string; type: string; text: string; options: { id: string; label: string }[] }[] }>("/questionnaire"),
  submitQuestionnaire: (answers: { questionId: string; optionId: string }[]) =>
    request<{ personality: Record<string, number> }>("/questionnaire/submit", { method: "POST", body: JSON.stringify({ version: "v1", answers }) }),
  listSimulations: () => request<any[]>("/simulations"),
  createSimulation: (name: string, agentIds: string[], durationDays?: number, decisionPolicy?: string) =>
    request<{ simulationId: string }>("/simulations", { method: "POST", body: JSON.stringify({ name, agentIds, durationDays, decisionPolicy }) }),
  getSimulation: (id: string) => request<any>(`/simulations/${id}`),
  startSimulation: (id: string) => request<any>(`/simulations/${id}/start`, { method: "POST" }),
  pauseSimulation: (id: string) => request<any>(`/simulations/${id}/pause`, { method: "POST" }),
  resumeSimulation: (id: string) => request<any>(`/simulations/${id}/resume`, { method: "POST" }),
  stopSimulation: (id: string) => request<any>(`/simulations/${id}/stop`, { method: "POST" }),
  replaySimulation: (id: string) => request<any>(`/simulations/${id}/replay`, { method: "POST" }),
  getWorld: (id: string) => request<any>(`/simulations/${id}/world`),
  getEconomy: (id: string) => request<any>(`/simulations/${id}/economy`),
  getLeaderboard: (id: string, type: string) => request<any>(`/simulations/${id}/leaderboard?type=${type}`),
  getEvents: (id: string, limit = 40) => request<any[]>(`/simulations/${id}/events?limit=${limit}`),
  getDecisions: (id: string, limit = 40) => request<any[]>(`/simulations/${id}/decisions?limit=${limit}`),
  getTransactions: (id: string, limit = 40) => request<any[]>(`/simulations/${id}/transactions?limit=${limit}`),
  getAnalytics: (id: string) => request<any>(`/simulations/${id}/analytics`),
  getAgent: (id: string) => request<any>(`/agents/${id}`),
};
