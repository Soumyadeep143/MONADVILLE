import { useEffect, useState } from "react";
import { api, getSessionUserId } from "./api.js";

interface SimulationSummary {
  id: string;
  name: string;
  status: string;
  currentDay: number;
  durationDays: number;
  decisionPolicy?: string;
}

export default function Lobby({ onOpenSimulation }: { onOpenSimulation: (id: string) => void }) {
  const [simulations, setSimulations] = useState<SimulationSummary[]>([]);
  const [name, setName] = useState("Baseline Experiment");
  const [extraAgents, setExtraAgents] = useState(19);
  const [durationDays, setDurationDays] = useState(30);
  const [decisionPolicy, setDecisionPolicy] = useState("LLM");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setSimulations(await api.listSimulations());
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  async function create() {
    setBusy(true);
    try {
      const userId = getSessionUserId()!;
      const extraIds = Array.from({ length: Math.max(0, extraAgents) }, () => crypto.randomUUID());
      const res = await api.createSimulation(name, [userId, ...extraIds], durationDays, decisionPolicy);
      await api.startSimulation(res.simulationId);
      await refresh();
      onOpenSimulation(res.simulationId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h3>New simulation</h3>
        <p style={{ color: "var(--muted)", fontSize: 12 }}>
          You join with your own questionnaire-derived profile (or a neutral default if you haven't taken it yet). Extra agents get randomly
          weighted profiles so the economy has enough participants to be interesting.
        </p>
        <div className="row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Simulation name" />
          <label>
            Extra agents{" "}
            <input type="number" min={0} max={49} value={extraAgents} onChange={(e) => setExtraAgents(Number(e.target.value))} style={{ width: 60 }} />
          </label>
          <label>
            Days <input type="number" min={1} max={365} value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} style={{ width: 60 }} />
          </label>
          <label>
            Decision policy{" "}
            <select value={decisionPolicy} onChange={(e) => setDecisionPolicy(e.target.value)}>
              <option value="LLM">LLM (Groq, falls back to personality)</option>
              <option value="PERSONALITY">Personality-driven (deterministic)</option>
              <option value="RANDOM">Random baseline</option>
              <option value="RATIONAL">Rational baseline</option>
            </select>
          </label>
          <button onClick={create} disabled={busy}>
            {busy ? "Creating..." : "Create & start"}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Simulations</h3>
        {simulations.length === 0 && <p style={{ color: "var(--muted)" }}>None yet.</p>}
        {simulations
          .slice()
          .reverse()
          .map((sim) => (
            <div className="sim-list-item" key={sim.id}>
              <div>
                <strong>{sim.name}</strong>{" "}
                <span className={`badge ${sim.status.toLowerCase()}`}>{sim.status}</span>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  Day {sim.currentDay}/{sim.durationDays} &middot; {sim.decisionPolicy ?? "LLM"}
                </div>
              </div>
              <button onClick={() => onOpenSimulation(sim.id)}>Open</button>
            </div>
          ))}
      </div>
    </div>
  );
}
