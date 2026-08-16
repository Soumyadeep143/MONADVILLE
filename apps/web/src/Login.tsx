import { useState } from "react";
import { supabase } from "./supabaseClient.js";

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() || email.trim() } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setInfo("Account created — check your email to confirm it, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
      }
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
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
        <p>{mode === "signin" ? "Sign in to join a shared simulation with other players." : "Create an account to join a shared simulation."}</p>
        <div className="row" style={{ marginBottom: 8 }}>
          <button onClick={() => setMode("signin")} disabled={mode === "signin"}>
            Sign in
          </button>
          <button onClick={() => setMode("signup")} disabled={mode === "signup"}>
            Create account
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mode === "signup" && <input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
          <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button onClick={submit} disabled={busy || !email.trim() || !password}>
            {busy ? "..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </div>
        {info && <p style={{ color: "var(--accent)" }}>{info}</p>}
        {error && <p style={{ color: "var(--bad)" }}>{error}</p>}
      </div>
    </div>
  );
}
