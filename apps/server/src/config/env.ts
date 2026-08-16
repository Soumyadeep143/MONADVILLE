import "dotenv/config";

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

  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_MODEL: process.env.CLAUDE_MODEL ?? "claude-haiku-4-5-20251001",

  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};
