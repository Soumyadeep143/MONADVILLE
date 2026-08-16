import type { Repositories } from "./repositories/index.js";
import { createInMemoryRepositories } from "./memory/index.js";
import { createMongoRepositories } from "./mongo/index.js";
import { createSupabaseRepositories } from "./supabase/index.js";
import { env } from "../config/env.js";

let cached: Repositories | null = null;

export async function getRepositories(): Promise<Repositories> {
  if (cached) return cached;
  if (env.PERSISTENCE_DRIVER === "mongo") {
    cached = await createMongoRepositories(env.MONGODB_URI ?? "");
  } else if (env.PERSISTENCE_DRIVER === "supabase") {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "PERSISTENCE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.",
      );
    }
    cached = createSupabaseRepositories(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  } else {
    cached = createInMemoryRepositories();
  }
  return cached;
}

export type { Repositories } from "./repositories/index.js";
