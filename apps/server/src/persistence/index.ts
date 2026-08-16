import type { Repositories } from "./repositories/index.js";
import { createInMemoryRepositories } from "./memory/index.js";
import { createMongoRepositories } from "./mongo/index.js";
import { env } from "../config/env.js";

let cached: Repositories | null = null;

export async function getRepositories(): Promise<Repositories> {
  if (cached) return cached;
  if (env.PERSISTENCE_DRIVER === "mongo") {
    cached = await createMongoRepositories(env.MONGODB_URI ?? "");
  } else {
    cached = createInMemoryRepositories();
  }
  return cached;
}

export type { Repositories } from "./repositories/index.js";
