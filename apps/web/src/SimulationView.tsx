import { useEffect, useState } from "react";
import { api } from "./api.js";

interface FeedItem {
  key: string;
  at: string;
  text: string;
  rejected?: boolean;
}

export default function SimulationView({ simulationId, onBack }: { simulationId: string; onBack: () => void }) {
  const [simulation, setSimulation] = useState<any>(null);
  const [economy, setEconomy] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const [sim, econ, board, events, decisions, txs] = await Promise.all([
        api.getSimulation(simulationId),
        api.getEconomy(simulationId).catch(() => null),
        api.getLeaderboard(simulationId, "wealth").catch(() => null),
        api.getEvents(simulationId, 30).catch(() => []),
        api.getDecisions(simulationId, 30).catch(() => []),
        api.getTransactions(simulationId, 30).catch(() => []),
      ]);
      if (cancelled) return;
      setSimulation(sim);
      setEconomy(econ);
      setLeaderboard(board);
      if (sim.status === "COMPLETED") {
        api.getAnalytics(simulationId).then((a) => !cancelled && setAnalytics(a)).catch(() => {});
      }

      const items: FeedItem[] = [
        ...events.map((e: any) => ({ key: `ev_${e.id}`, at: e.createdAt, text: `[${e.type}] ${e.message}` })),
        ...decisions.map((d: any) => ({
          key: `dec_${d.id}`,
          at: d.createdAt,
          text: `[DECISION] agent ${d.agentId.slice(0, 8)} day ${d.gameDay}: ${d.selectedAction.action}${d.selectedAction.targetId ? ` -> ${d.selectedAction.targetId.slice(0, 8)}` : ""} (${d.selectedAction.reasonCode}) [${d.source}]`,
        })),
        ...txs.map((t: any) => ({
          key: `tx_${t.id}`,
          at: t.createdAt,
          text: `[TX ${t.type}] ${(t.fromAgentId ?? "TREASURY").slice(0, 8)} -> ${(t.toAgentId ?? "TREASURY").slice(0, 8)}: ${t.netAmount} (tax ${t.taxAmount}) status=${t.blockchain.status}`,
        })),
      ].sort((a, b) => b.at.localeCompare(a.at));

      setFeed(items.slice(0, 60));
    }

    tick();
    const t = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [simulationId]);

  if (!simulation) return <p>Loading...</p>;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button onClick={onBack}>&larr; Back</button>
        <div className="row">
          <span className={`badge ${simulation.status.toLowerCase()}`}>{simulation.status}</span>
          {simulation.status === "RUNNING" && <button onClick={() => api.pauseSimulation(simulationId)}>Pause</button>}
          {simulation.status === "PAUSED" && <button onClick={() => api.resumeSimulation(simulationId)}>Resume</button>}
          {(simulation.status === "RUNNING" || simulation.status === "PAUSED") && <button onClick={() => api.stopSimulation(simulationId)}>Stop</button>}
        </div>
      </div>

      <div className="card">
        <h3>
          {simulation.name} — day {simulation.currentDay}/{simulation.durationDays}
        </h3>
        <div className="grid">
          <div className="stat">
            <div className="label">Treasury</div>
            <div className="value">{economy?.treasuryBalance ?? "—"}</div>
          </div>
          <div className="stat">
            <div className="label">Money supply</div>
            <div className="value">{economy?.moneySupply ?? "—"}</div>
          </div>
          <div className="stat">
            <div className="label">Gini</div>
            <div className="value">{economy?.gini ?? "—"}</div>
          </div>
          <div className="stat">
            <div className="label">Avg wealth</div>
            <div className="value">{economy?.averageWealth ?? "—"}</div>
          </div>
          <div className="stat">
            <div className="label">Farms</div>
            <div className="value">{economy?.businesses?.farms ?? 0}</div>
          </div>
          <div className="stat">
            <div className="label">Restaurants</div>
            <div className="value">{economy?.businesses?.restaurants ?? 0}</div>
          </div>
          <div className="stat">
            <div className="label">Theatres</div>
            <div className="value">{economy?.businesses?.theatres ?? 0}</div>
          </div>
          <div className="stat">
            <div className="label">Avg wage</div>
            <div className="value">{economy?.averageWage ?? 0}</div>
          </div>
        </div>
      </div>

      {analytics && (
        <div className="card">
          <h3>Final results</h3>
          <div className="grid">
            <div className="stat">
              <div className="label">Wealth Gini</div>
              <div className="value">{analytics.wealth.gini}</div>
            </div>
            <div className="stat">
              <div className="label">Top 10% share</div>
              <div className="value">{analytics.wealth.top10Share}</div>
            </div>
            <div className="stat">
              <div className="label">Businesses survived</div>
              <div className="value">
                {analytics.business.created - analytics.business.failed}/{analytics.business.created}
              </div>
            </div>
            <div className="stat">
              <div className="label">Employment rate</div>
              <div className="value">{analytics.labor.employmentRate}</div>
            </div>
            <div className="stat">
              <div className="label">Loan defaults</div>
              <div className="value">
                {analytics.finance.defaults}/{analytics.finance.loansIssued}
              </div>
            </div>
            <div className="stat">
              <div className="label">Highest activity</div>
              <div className="value">{analytics.activity.highest}</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Wealth leaderboard</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Agent</th>
              <th>Net worth</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard?.ranked?.slice(0, 10).map((row: any, i: number) => (
              <tr key={row.agentId}>
                <td>{i + 1}</td>
                <td>{row.agentId.slice(0, 10)}</td>
                <td>{Math.round(row.score * 100) / 100}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Live decision &amp; transaction terminal</h3>
        <div className="terminal">
          {feed.length === 0 && <div style={{ color: "var(--muted)" }}>Waiting for activity...</div>}
          {feed.map((item) => (
            <div className="terminal-line" key={item.key}>
              {item.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
