import { useEffect, useState } from "react";
import { api, clearIdentity, getDisplayName, setIdentity } from "./api.js";
import { supabase } from "./supabaseClient.js";
import Login from "./Login.js";
import Questionnaire from "./Questionnaire.js";
import Lobby from "./Lobby.js";
import SimulationView from "./SimulationView.js";

type View = "questionnaire" | "lobby" | "simulation";
type AuthState = "checking" | "signedOut" | "signedIn";

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [view, setView] = useState<View>("lobby");
  const [activeSimId, setActiveSimId] = useState<string | null>(null);

  useEffect(() => {
    async function syncSession(hasSession: boolean) {
      if (!hasSession) {
        clearIdentity();
        setAuthState("signedOut");
        return;
      }
      // /me is what actually creates/looks up the internal User row for
      // this Supabase account (see auth/index.ts's requireAuth) — the
      // identity cache other components read (Lobby's "join as yourself")
      // needs the internal id, not the raw Supabase auth id.
      try {
        const me = await api.me();
        setIdentity(me.id, me.displayName);
        setAuthState("signedIn");
      } catch {
        clearIdentity();
        setAuthState("signedOut");
      }
    }

    supabase.auth.getSession().then(({ data }) => syncSession(!!data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSession(!!session);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  if (authState === "checking") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <h1>ECONFORGE</h1>
        </div>
        <p style={{ color: "var(--muted)" }}>
          <span className="spinner" /> Loading session...
        </p>
      </div>
    );
  }

  if (authState === "signedOut") {
    return <Login onLoggedIn={() => setAuthState("signedIn")} />;
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>ECONFORGE</h1>
        <div className="row">
          <span style={{ color: "var(--muted)" }}>{getDisplayName()}</span>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
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
