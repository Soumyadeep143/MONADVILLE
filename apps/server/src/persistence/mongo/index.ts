// STUB — see ./README.md. The MongoDB dev implements createMongoRepositories()
// here against the interfaces in ../repositories/index.ts. Until then,
// PERSISTENCE_DRIVER must stay "memory" (the default — see ../index.ts).

import type { Repositories } from "../repositories/index.js";

export async function createMongoRepositories(_connectionUri: string): Promise<Repositories> {
  throw new Error(
    "Mongo persistence driver not implemented yet. See apps/server/src/persistence/mongo/README.md. " +
      'Set PERSISTENCE_DRIVER=memory (default) until this is ready.',
  );
}
