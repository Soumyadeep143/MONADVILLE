import { useState } from "react";
import { api, setSession } from "./api.js";

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.devLogin(name.trim() || "Player");
      setSession(res.token, res.userId, res.displayName);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>ECONFORGE</h1>
      </div>
      <div className="card" style={{ maxWidth: 420 }}>
        <p>Sign in to create your agent profile and join a simulation.</p>
        <p style={{ color: "var(--muted)", fontSize: 12 }}>
          Dev-mode sign-in — no real account, just a display name. Swap in Supabase later without touching anything downstream.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          <button onClick={submit} disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </div>
        {error && <p style={{ color: "var(--bad)" }}>{error}</p>}
      </div>
    </div>
  );
}
