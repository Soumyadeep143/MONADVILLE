# MongoDB persistence — implement this

This folder is the seam for the real MongoDB-backed persistence layer described
in `docs/database.md`. Everything else in the app talks to `Repositories`
(`apps/server/src/persistence/repositories/index.ts`) and doesn't know or
care whether the implementation is in-memory or Mongo.

## What to build

Implement each interface in `../repositories/index.ts` using the official
`mongodb` driver (or `mongoose`, your call) against the collections and
document shapes documented in `docs/database.md` §3–11:

- `users`, `agents`, `simulations`, `businesses`, `properties`,
  `transactions`, `loans`, `events`, `agent_decisions`

Export a single factory, matching the in-memory version's shape:

```ts
// mongo/index.ts
import type { Repositories } from "../repositories/index.js";

export async function createMongoRepositories(connectionUri: string): Promise<Repositories> {
  // connect, build indexes per database.md §3-11, return the 9 repository impls
}
```

Then wire it into `apps/server/src/persistence/index.ts` — flip
`PERSISTENCE_DRIVER=mongo` and construct `createMongoRepositories(...)`
there instead of the in-memory factory. Nothing else in the codebase should
need to change.

## Notes from docs/database.md worth preserving

- `agents`: index `simulationId`, and `userId + simulationId`.
- `transactions`: index `simulationId + gameDay`, `blockchain.txHash`,
  `fromAgentId`, `toAgentId`.
- `economic.cash` in the `agents` document is a **cached view** — the ledger
  (owned separately, see `contracts/README.md`) is authoritative. A
  reconciliation job should periodically diff the two and flag/pause the
  simulation on mismatch (§14 of database.md). That job doesn't exist yet —
  worth adding once this seam is real.
- Never persist raw questionnaire answers or the personality vector on-chain
  (that's a blockchain-side concern, not yours, but keep it in mind if you
  ever mirror agent docs anywhere public).
- `properties` gained one field beyond database.md §7: `forSale: boolean`
  (default `false`). It backs the peer-to-peer property market
  (`economy/property.ts`) — `SELL_PROPERTY` lists a property by setting this
  true, and `BUY_PROPERTY` with a target id buys a listing directly from its
  owner (taxed like any transfer). Index it alongside `simulationId` if you
  want the "browse listings" query to be fast at scale.
