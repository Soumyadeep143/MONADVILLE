# MongoDB persistence

`index.ts` implements the `Repositories` seam
(`apps/server/src/persistence/repositories/index.ts`) against a real MongoDB
cluster using the official `mongodb` driver — one collection per interface,
matching `docs/database.md` §3–11: `users`, `agents`, `simulations`,
`businesses`, `properties`, `transactions`, `loans`, `events`,
`agent_decisions`. Nothing outside `persistence/` knows or cares that this
isn't the in-memory driver — same pattern as `../supabase/`, which
implements the identical interfaces against Postgres instead, if you'd
rather run against that.

Verified end-to-end (real cluster, not mocked): create a simulation, run it
to completion, re-fetch every collection on a **fresh** connection to prove
the writes actually persisted, recompute analytics — all round-tripped
correctly.

`PERSISTENCE_DRIVER=mongo` + `MONGODB_URI` in `.env` selects this driver
(see `apps/server/src/persistence/index.ts`); `.env.example` still defaults
to `memory` so a fresh clone runs with zero external services.

Mongo is schemaless, so — unlike the Supabase/Postgres driver — nested
domain fields (`personality`, `economic`, `state`, `employees`,
`blockchain`, `metrics`, ...) are stored as-is, no jsonb-style flattening.
The only conversion at the boundary is the id: Mongo's `_id` (`ObjectId`)
maps to/from the interfaces' `string` id; every other id-shaped field
(`userId`, `simulationId`, `ownerAgentId`, ...) is stored as a plain string
— the same hex string `_id.toHexString()` produces — so cross-collection
lookups are ordinary string-equality queries, no casting.

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
- `simulations` gained one field beyond database.md §5: `decisionPolicy:
  "LLM" | "PERSONALITY" | "RANDOM" | "RATIONAL"` (default `"LLM"`). It's the
  prd.md §22 experiment-mode baseline selector — read once per day by
  DayProcessor, never mutated after creation. No index needed.
- `simulations.rules` is no longer just a record of the constants — economy
  code actually reads it (`EconomyContext.rules`, threaded through every
  ledger/loan/wage call) instead of the global default constants, so two
  simulations can run different tax rates / loan terms concurrently
  (prd.md §22 "tax-rate comparison" / "loan-policy comparison"). Nothing
  extra to do here beyond storing whatever `SimulationRules` object you're
  given — just don't silently coerce it back to the defaults on read.
