import { useEffect, useState } from "react";
import { api } from "./api.js";

export default function AgentProfile({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [agent, setAgent] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const a = await api.getAgent(agentId).catch(() => null);
      if (!cancelled) setAgent(a);
    }
    tick();
    const t = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [agentId]);

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Agent {agentId.slice(0, 10)}</h3>
        <button onClick={onClose}>Close</button>
      </div>

      {!agent && <p style={{ color: "var(--muted)" }}>Loading...</p>}

      {agent && (
        <>
          <div className="grid">
            <div className="stat">
              <div className="label">Cash</div>
              <div className="value">{agent.economic.cash}</div>
            </div>
            <div className="stat">
              <div className="label">Debt</div>
              <div className="value">{agent.economic.outstandingDebt}</div>
            </div>
            <div className="stat">
              <div className="label">Reputation</div>
              <div className="value">{agent.reputation.score}</div>
            </div>
            <div className="stat">
              <div className="label">Activity</div>
              <div className="value">{agent.activity.score}</div>
            </div>
            <div className="stat">
              <div className="label">Employment</div>
              <div className="value">{agent.state.employmentStatus}</div>
            </div>
            <div className="stat">
              <div className="label">Hunger</div>
              <div className="value">{agent.state.hunger}</div>
            </div>
          </div>

          <h4 style={{ marginTop: 16 }}>Behavioral tendencies</h4>
          <div className="grid">
            {Object.entries(agent.personality).map(([trait, value]) => (
              <div className="stat" key={trait}>
                <div className="label">{trait}</div>
                <div className="value">{String(value)}</div>
              </div>
            ))}
          </div>

          <h4 style={{ marginTop: 16 }}>Statistics</h4>
          <div className="grid">
            <div className="stat">
              <div className="label">Transactions</div>
              <div className="value">{agent.statistics.transactions}</div>
            </div>
            <div className="stat">
              <div className="label">Theatre visits</div>
              <div className="value">{agent.statistics.theatreVisits}</div>
            </div>
            <div className="stat">
              <div className="label">Businesses started</div>
              <div className="value">{agent.statistics.businessesCreated}</div>
            </div>
            <div className="stat">
              <div className="label">Businesses failed</div>
              <div className="value">{agent.statistics.businessesFailed}</div>
            </div>
            <div className="stat">
              <div className="label">Loans taken</div>
              <div className="value">{agent.statistics.loansTaken}</div>
            </div>
            <div className="stat">
              <div className="label">Loans defaulted</div>
              <div className="value">{agent.statistics.loansDefaulted}</div>
            </div>
          </div>

          <h4 style={{ marginTop: 16 }}>Recent reputation history</h4>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Delta</th>
                <th>Reason</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {agent.reputation.history
                .slice(-8)
                .reverse()
                .map((h: any, i: number) => (
                  <tr key={i}>
                    <td>{h.day}</td>
                    <td>{h.delta > 0 ? `+${h.delta}` : h.delta}</td>
                    <td>{h.reason}</td>
                    <td>{h.value}</td>
                  </tr>
                ))}
              {agent.reputation.history.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: "var(--muted)" }}>
                    No history yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <h4 style={{ marginTop: 16 }}>Recent memory</h4>
          <div className="terminal" style={{ height: 140 }}>
            {agent.memory
              .slice()
              .reverse()
              .map((m: any, i: number) => (
                <div className="terminal-line" key={i}>
                  Day {m.day}: {m.summary}
                </div>
              ))}
            {agent.memory.length === 0 && <div style={{ color: "var(--muted)" }}>No activity yet.</div>}
          </div>
        </>
      )}
    </div>
  );
}
