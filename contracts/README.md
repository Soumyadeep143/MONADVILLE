# EconomicLedger contract — implement this

This is the seam for the Monad on-chain ledger described in
`docs/architecture.md` §6/§9 and `docs/prd.md` §12–14. The rest of the app
(the economy engine) talks only to the `LedgerService` interface at
`apps/server/src/blockchain/LedgerService.ts` — it never assumes Solidity,
ethers/viem, or any particular chain client underneath.

`apps/server/src/blockchain/InMemoryLedgerService.ts` is a working
reference implementation of the required money-movement semantics (2% tax
split, treasury accounting, loan disbursement/repayment) — read it first,
it's the spec in executable form.

## What to build

1. `EconomicLedger.sol` here in `contracts/`, covering:
   - Per-simulation (or per-deployment) agent balance registration/genesis
     mint of starting cash.
   - `transfer(from, to, grossAmount)` — 2% tax to treasury, remainder to
     recipient. When `to` is the treasury itself, the split is irrelevant
     (it all lands in the treasury either way) — see the in-memory impl.
   - Loan disbursement (treasury -> agent, untaxed) and repayment (agent ->
     treasury, principal + interest).
   - Collateral seizure on default (moves value to treasury).
   - Treasury balance must never go negative; treasury cannot mint new
     money — it can only lend what it holds (prd.md §13).
   - Emit events for each of the above (transfer, loan funded, loan repaid,
     default) with enough data to reconstruct a transaction hash + block
     number.

2. `apps/server/src/blockchain/MonadLedgerService.ts` — replace the stub
   with real calls against the deployed contract, implementing the exact
   same `LedgerService` interface. Nothing else in the codebase should need
   to change; flipping `LEDGER_DRIVER=monad` in `.env` is the only wiring
   step.

## Non-negotiable invariants (see docs/flow.md §17 and docs/prd.md §23)

```
grossAmount = recipientAmount + tax
tax = grossAmount * 0.02
recipientAmount = grossAmount - tax

treasuryBalance >= 0 at all times
loanAmount <= treasuryAvailable at issuance
```

Money is conserved except for the one explicit creation event: each agent's
starting-cash genesis mint at simulation start.
