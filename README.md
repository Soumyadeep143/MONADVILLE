# EconForge

Controlled multi-agent economic simulation. See `docs/` for the full spec (`prd.md`, `architecture.md`, `flow.md`, `database.md`, `api.md`, `roadmap.md`).

## Status

Real, persistent, multiplayer-ready today:

- **Game data** — MongoDB (`apps/server/src/persistence/mongo/`), or Postgres via Supabase (`apps/server/src/persistence/supabase/`) — same `Repositories` interface, pick either with `PERSISTENCE_DRIVER=mongo|supabase` in `.env`.
- **Accounts** — Supabase Auth (`AUTH_DRIVER=supabase`) — real email/password sign-in (`apps/web/src/Login.tsx`), verified server-side on every request (`apps/server/src/auth/supabaseAuth.ts`). Two players signing in from two different machines see the same shared simulations, because nothing about game state ever lived in browser storage — only the Supabase session token does, and that's Supabase's own, not a hand-rolled one.

Still an in-memory stand-in for the one piece owned by a separate teammate:

- **Monad ledger / smart contract** — `contracts/README.md`. Flip `LEDGER_DRIVER=monad` in `.env` once it's implemented against `apps/server/src/blockchain/LedgerService.ts`; nothing else in the codebase needs to change.

`PERSISTENCE_DRIVER=memory` / `AUTH_DRIVER=dev` remain the zero-external-services defaults in `.env.example`, so a fresh clone still runs with nothing configured — copy `.env` from that and fill in real credentials only when you want the shared/multiplayer path.

## Run it

```sh
npm install
npm run build -w packages/shared     # required once before dev/simulate/test

cp .env.example .env                 # every default runs with zero external services
cp apps/web/.env.example apps/web/.env  # only needed if AUTH_DRIVER=supabase — the dashboard needs its own Supabase project ref/anon key (Vite only reads VITE_-prefixed vars from here, not the root .env)

npm run dev:server                   # API on :4000
npm run dev:web                      # dashboard on :5173

npm run simulate                     # headless: 20 agents x 30 days, prints prd.md §23 acceptance checks
npm run experiment                   # 10-scenario controlled-experiment battery (prd.md §22), prints a comparison table
npm test                             # vitest units (tax math, loan limits, gini, business failure)
```

Set `GROQ_API_KEY` to have agents use Groq for decisions; without it (or on any LLM failure), agents run on a deterministic personality-weighted fallback policy — the simulation always runs. Agent decisions within a cycle are fanned out concurrently (`DECISION_CONCURRENCY`, default 4) since the LLM round trip — not local computation — is what dominates a cycle's wall-clock time; only the state-mutating execution step is serialized. A full 20-agent/30-day run against real Groq is on the order of 15–20 minutes at the default concurrency (~1800 decision calls) — fine for the background scheduler, but don't expect the headless script to finish quickly with a key set; unset `GROQ_API_KEY` for a fast fallback-only run when you just want to check the economics.

### Decision policies & experiments (prd.md §22 / roadmap.md Phase 9)

Every simulation picks a `decisionPolicy` at creation (dashboard dropdown, or the API's `decisionPolicy` field): `LLM` (Groq, falls back to `PERSONALITY` on any failure — the default), `PERSONALITY` (the same deterministic personality-weighted policy, but never touches the LLM), `RANDOM` (uniform pick among valid actions), or `RATIONAL` (a fixed, personality-blind utility ranking). Only `LLM` is non-deterministic run-to-run; the other three give identical results for the same seed, which is what makes them useful as baselines to compare personality-driven behavior against.

Simulations also accept a `rulesOverride` (tax rate, wage, loan terms, worker requirement) and a pinned `seed`, so `npm run experiment` can hold a population and rules constant while varying just the policy, or hold the policy constant while varying the rules — see `scripts/run-experiment.ts` for the scenario battery and `apps/server/src/simulation/populations.ts` for the seeded population generators (homogeneous / heterogeneous / trait-skewed).

### Seeded replay (flow.md §15 / roadmap.md Phase 10)

`POST /simulations/:id/replay` re-runs a **completed** simulation from its stored seed, rules, and population under the same policy, then diffs the two runs' final analytics — proving the seed-reproducibility claim above on demand, not just via the batch experiment script. Only `PERSONALITY`/`RANDOM`/`RATIONAL` are replayable (`LLM` calls a live model and is documented as non-deterministic); the dashboard's simulation view exposes a "Run replay" button once a run of one of those policies completes. See `apps/server/src/simulation/replay.ts`.

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
