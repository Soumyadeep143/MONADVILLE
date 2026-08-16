import { useState } from "react";
import { clearSession, getDisplayName, getToken } from "./api.js";
import Login from "./Login.js";
import Questionnaire from "./Questionnaire.js";
import Lobby from "./Lobby.js";
import SimulationView from "./SimulationView.js";

type View = "questionnaire" | "lobby" | "simulation";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken());
  const [view, setView] = useState<View>("lobby");
  const [activeSimId, setActiveSimId] = useState<string | null>(null);

  if (!loggedIn) {
    return <Login onLoggedIn={() => setLoggedIn(true)} />;
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>ECONFORGE</h1>
        <div className="row">
          <span style={{ color: "var(--muted)" }}>{getDisplayName()}</span>
          <button
            onClick={() => {
              clearSession();
              setLoggedIn(false);
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {view !== "simulation" && (
        <div className="row" style={{ marginBottom: 16 }}>
          <button onClick={() => setView("questionnaire")} disabled={view === "questionnaire"}>
            Questionnaire
          </button>
          <button onClick={() => setView("lobby")} disabled={view === "lobby"}>
            Simulations
          </button>
        </div>
      )}

      {view === "questionnaire" && <Questionnaire />}
      {view === "lobby" && (
        <Lobby
          onOpenSimulation={(id) => {
            setActiveSimId(id);
            setView("simulation");
          }}
        />
      )}
      {view === "simulation" && activeSimId && <SimulationView simulationId={activeSimId} onBack={() => setView("lobby")} />}
    </div>
  );
}
