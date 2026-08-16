import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the monorepo-root .env explicitly — npm workspace scripts run with
// cwd set to the workspace package (apps/server), so dotenv's default
// "load .env from process.cwd()" would silently miss the root .env that
// .env.example documents. This resolves relative to this file instead, so
// it works the same whether invoked via `npm run dev:server`, the
// headless `simulate` script, or a plain `node dist/index.js`.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../../.env") });

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  NODE_ENV: process.env.NODE_ENV ?? "development",

  PERSISTENCE_DRIVER: pick(process.env.PERSISTENCE_DRIVER, ["memory", "mongo"] as const, "memory"),
  MONGODB_URI: process.env.MONGODB_URI,

  LEDGER_DRIVER: pick(process.env.LEDGER_DRIVER, ["memory", "monad"] as const, "memory"),
  MONAD_RPC_URL: process.env.MONAD_RPC_URL,
  MONAD_LEDGER_ADDRESS: process.env.MONAD_LEDGER_ADDRESS,

  AUTH_DRIVER: pick(process.env.AUTH_DRIVER, ["dev", "supabase"] as const, "dev"),
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,

  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_MODEL: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant",
  // Concurrent in-flight agent decision calls per cycle — Groq is fast enough
  // that latency is dominated by round trips, not tokens/sec, so batching
  // many agents' decisions concurrently is the actual lever. Kept modest by
  // default to stay under free-tier rate limits; raise it if your Groq tier
  // allows more.
  DECISION_CONCURRENCY: Number(process.env.DECISION_CONCURRENCY ?? 8),

  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};
