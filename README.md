# EconForge

Controlled multi-agent economic simulation. See `docs/` for the full spec (`prd.md`, `architecture.md`, `flow.md`, `database.md`, `api.md`, `roadmap.md`).

## Status

Everything runs today on in-memory stand-ins for the two pieces owned by other teammates:

- **MongoDB persistence** — `apps/server/src/persistence/mongo/README.md`
- **Monad ledger / smart contract** — `contracts/README.md`

Flip `PERSISTENCE_DRIVER=mongo` / `LEDGER_DRIVER=monad` in `.env` once those are implemented; nothing else in the codebase needs to change (see `apps/server/src/persistence/repositories/index.ts` and `apps/server/src/blockchain/LedgerService.ts` for the interfaces).

## Run it

```sh
npm install
npm run build -w packages/shared     # required once before dev/simulate/test

cp .env.example .env                 # every default runs with zero external services

npm run dev:server                   # API on :4000
npm run dev:web                      # dashboard on :5173

npm run simulate                     # headless: 20 agents x 30 days, prints prd.md §23 acceptance checks
npm test                             # vitest units (tax math, loan limits, gini, business failure)
```

Set `GROQ_API_KEY` to have agents use Groq for decisions; without it (or on any LLM failure), agents run on a deterministic personality-weighted fallback policy — the simulation always runs. Agent decisions within a cycle are fanned out concurrently (`DECISION_CONCURRENCY`, default 8) since the LLM round trip — not local computation — is what dominates a cycle's wall-clock time; only the state-mutating execution step is serialized. A full 20-agent/30-day run against real Groq is on the order of 15–20 minutes at the default concurrency (~1800 decision calls) — fine for the background scheduler, but don't expect the headless script to finish quickly with a key set; unset `GROQ_API_KEY` for a fast fallback-only run when you just want to check the economics.

**Gotcha:** `apps/server` resolves `@econforge/shared` through its **compiled** `dist/`, not live source — if you edit anything under `packages/shared/src` while `npm run dev:server` is running, rebuild it (`npm run build -w packages/shared`) or the dev server will crash-loop on the stale export until you do.

## Layout

```
apps/web        React (Vite) dashboard
apps/server     Node/Express API + simulation/economy/agent engines
packages/shared TypeScript types, zod schemas, rules constants
contracts/      Monad EconomicLedger contract (owned by the blockchain dev)
scripts/        headless simulation runner
docs/           the spec
```
