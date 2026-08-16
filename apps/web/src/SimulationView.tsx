import { useEffect, useState } from "react";
import { api } from "./api.js";
import AgentProfile from "./AgentProfile.js";
import WorldView from "./WorldView.js";
import { shortId } from "./format.js";

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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [replay, setReplay] = useState<any>(null);
  const [replayBusy, setReplayBusy] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

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
          text: `[DECISION] agent ${shortId(d.agentId)} day ${d.gameDay}: ${d.selectedAction.action}${d.selectedAction.targetId ? ` -> ${shortId(d.selectedAction.targetId)}` : ""} (${d.selectedAction.reasonCode}) [${d.source}]`,
        })),
        ...txs.map((t: any) => ({
          key: `tx_${t.id}`,
          at: t.createdAt,
          text: `[TX ${t.type}] ${shortId(t.fromAgentId ?? "TREASURY")} -> ${shortId(t.toAgentId ?? "TREASURY")}: ${t.netAmount} (tax ${t.taxAmount}) status=${t.blockchain.status}`,
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

  async function runReplay() {
    setReplayBusy(true);
    setReplayError(null);
    try {
      setReplay(await api.replaySimulation(simulationId));
    } catch (err) {
      setReplayError(err instanceof Error ? err.message : "Replay failed");
    } finally {
      setReplayBusy(false);
    }
  }

  if (!simulation)
    return (
      <p style={{ color: "var(--muted)" }}>
        <span className="spinner" /> Loading...
      </p>
    );

  const canReplay = simulation.status === "COMPLETED" && simulation.decisionPolicy !== "LLM";

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button onClick={onBack}>&larr; Back</button>
        <div className="row">
          <span className={`badge ${simulation.status.toLowerCase()}`}>{simulation.status}</span>
          {simulation.status === "RUNNING" && <button onClick={() => api.pauseSimulation(simulationId)}>Pause</button>}
          {(simulation.status === "PAUSED" || simulation.status === "FAILED") && (
            <button onClick={() => api.resumeSimulation(simulationId)}>{simulation.status === "FAILED" ? "Retry" : "Resume"}</button>
          )}
          {(simulation.status === "RUNNING" || simulation.status === "PAUSED") && <button onClick={() => api.stopSimulation(simulationId)}>Stop</button>}
        </div>
      </div>

      <div className="card">
        <h3>World</h3>
        <WorldView simulationId={simulationId} />
        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
          Green dots are employed agents, gray are unemployed. Positions are approximate (derived from ids, not real coordinates) — watch
          for speech bubbles when an agent's latest decision changes.
        </p>
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

      {simulation.status === "COMPLETED" && (
        <div className="card">
          <h3>Seeded replay</h3>
          {canReplay ? (
            <p style={{ color: "var(--muted)", fontSize: 12 }}>
              Re-runs this simulation from its stored seed, rules, and population under the same ({simulation.decisionPolicy}) policy, then
              checks whether the final analytics match — proving the run is reproducible.
            </p>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: 12 }}>
              This simulation used the LLM policy, which calls a live model and isn't deterministic — replay only supports
              PERSONALITY/RANDOM/RATIONAL policies.
            </p>
          )}
          {canReplay && (
            <button onClick={runReplay} disabled={replayBusy}>
              {replayBusy ? (
                <>
                  <span className="spinner" /> Replaying...
                </>
              ) : (
                "Run replay"
              )}
            </button>
          )}
          {replayError && <p style={{ color: "var(--bad)" }}>{replayError}</p>}
          {replay && (
            <div className="grid" style={{ marginTop: 12 }}>
              <div className="stat">
                <div className="label">Result</div>
                <div className="value" style={{ color: replay.matches ? "var(--accent)" : "var(--bad)" }}>
                  {replay.matches ? "MATCH" : "DIVERGED"}
                </div>
              </div>
              <div className="stat">
                <div className="label">Divergences</div>
                <div className="value">{replay.divergences.length}</div>
              </div>
            </div>
          )}
          {replay && replay.divergences.length > 0 && (
            <div className="terminal" style={{ height: 120, marginTop: 12 }}>
              {replay.divergences.map((d: string, i: number) => (
                <div className="terminal-line" key={i}>
                  {d}
                </div>
              ))}
            </div>
          )}
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
              <tr key={row.agentId} onClick={() => setSelectedAgentId(row.agentId)} style={{ cursor: "pointer" }}>
                <td>{i + 1}</td>
                <td>{shortId(row.agentId, 10)}</td>
                <td>{Math.round(row.score * 100) / 100}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>Click a row to view that agent's profile.</p>
      </div>

      {selectedAgentId && <AgentProfile agentId={selectedAgentId} onClose={() => setSelectedAgentId(null)} />}

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
