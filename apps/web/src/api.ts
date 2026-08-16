const BASE = "/api/v1";

export function getToken(): string | null {
  return localStorage.getItem("econforge_token");
}

export function setSession(token: string, userId: string, displayName: string) {
  localStorage.setItem("econforge_token", token);
  localStorage.setItem("econforge_user_id", userId);
  localStorage.setItem("econforge_display_name", displayName);
}

export function getSessionUserId(): string | null {
  return localStorage.getItem("econforge_user_id");
}

export function getDisplayName(): string | null {
  return localStorage.getItem("econforge_display_name");
}

export function clearSession() {
  localStorage.removeItem("econforge_token");
  localStorage.removeItem("econforge_user_id");
  localStorage.removeItem("econforge_display_name");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
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
  devLogin: (displayName: string) => request<{ token: string; userId: string; displayName: string }>("/auth/dev-login", { method: "POST", body: JSON.stringify({ displayName }) }),
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
  getWorld: (id: string) => request<any>(`/simulations/${id}/world`),
  getEconomy: (id: string) => request<any>(`/simulations/${id}/economy`),
  getLeaderboard: (id: string, type: string) => request<any>(`/simulations/${id}/leaderboard?type=${type}`),
  getEvents: (id: string, limit = 40) => request<any[]>(`/simulations/${id}/events?limit=${limit}`),
  getDecisions: (id: string, limit = 40) => request<any[]>(`/simulations/${id}/decisions?limit=${limit}`),
  getTransactions: (id: string, limit = 40) => request<any[]>(`/simulations/${id}/transactions?limit=${limit}`),
  getAnalytics: (id: string) => request<any>(`/simulations/${id}/analytics`),
  getAgent: (id: string) => request<any>(`/agents/${id}`),
};
