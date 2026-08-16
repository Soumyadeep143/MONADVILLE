# EconForge — System Architecture

## 1. Architecture principle

The system has four authorities:

- Node.js: simulation/game authority.
- MongoDB: off-chain simulation-state authority.
- Monad smart contract: monetary ledger authority.
- Supabase: authentication/realtime/user-facing infrastructure.

The LLM is NOT an authority. It only proposes/selects actions.

## 2. High-level architecture

```text
                         React
                           |
                    REST/WebSocket
                           |
                           v
                    Node.js Backend
                           |
        +------------------+------------------+
        |                  |                  |
        v                  v                  v
   Simulation Engine   Agent Engine       API Layer
        |                  |                  |
        |                  v                  |
        |              LLM Provider           |
        |                                     |
        +------------------+------------------+
                           |
                 +---------+---------+
                 |                   |
                 v                   v
              MongoDB             Monad
                 |                   |
                 |             EconomicLedger
                 |                   |
                 +---------+---------+
                           |
                           v
                       Supabase
                 Auth / Realtime / User UI
```

## 3. Repository layout

```text
econforge/
├── apps/
│   ├── web/                     # React
│   └── server/                  # Node.js
├── contracts/
│   └── EconomicLedger.sol
├── packages/
│   ├── shared/                  # schemas/types/constants
│   └── simulation/              # reusable simulation logic if desired
├── docs/
│   ├── prd.md
│   ├── architecture.md
│   ├── roadmap.md
│   ├── flow.md
│   ├── database.md
│   └── api.md
├── scripts/
└── README.md
```

## 4. Frontend

React responsibilities:
- authentication UI
- questionnaire
- agent profile
- world map/UI
- simulation timeline
- event feed
- economy dashboard
- leaderboard
- final results

React must not:
- calculate authoritative balances
- execute economic rules
- decide whether an action is valid
- directly call the LLM
- directly mutate simulation state

## 5. Node backend

Node responsibilities:
- API
- simulation lifecycle
- agent orchestration
- action validation
- game rules
- MongoDB persistence
- blockchain transaction orchestration
- analytics
- event generation
- LLM calls

Suggested modules:

```text
server/src/
├── config/
├── api/
├── auth/
├── simulation/
│   ├── SimulationEngine
│   ├── DayProcessor
│   ├── WorldState
│   └── EventEngine
├── agents/
│   ├── AgentRunner
│   ├── DecisionEngine
│   ├── PersonalityEngine
│   └── MemoryService
├── economy/
│   ├── EconomyEngine
│   ├── MarketService
│   ├── LaborService
│   ├── BusinessService
│   ├── LoanService
│   ├── ReputationService
│   └── ActivityService
├── blockchain/
│   ├── LedgerService
│   ├── TreasuryService
│   └── ReconciliationService
├── analytics/
└── persistence/
```

## 6. Authority model

### Monad is authoritative for:
- on-chain monetary balances
- transaction tax
- treasury balance
- loan principal/repayment events
- transaction hashes

### MongoDB is authoritative for:
- personality
- hunger
- businesses
- properties
- employment
- production
- reputation
- activity
- agent memory
- simulation state
- derived/cached monetary values

MongoDB cash is a cached view and must reconcile against the ledger.

## 7. Simulation transaction flow

```text
Agent decides to BUY_MEAL
        |
        v
Candidate action validated locally
        |
        v
Economic engine checks:
- buyer exists
- seller exists
- item exists
- price valid
- buyer has funds
        |
        v
LedgerService.transfer()
        |
        v
Monad EconomicLedger
        |
        +--> recipient amount
        |
        +--> 2% treasury tax
        |
        v
Transaction hash
        |
        v
MongoDB transaction record
        |
        v
Update off-chain state
        |
        v
Realtime event
        |
        v
React
```

## 8. Important consistency rule

Never mutate MongoDB as if a monetary transaction succeeded before the blockchain result is accepted.

Use transaction states:

```text
PENDING
CONFIRMED
FAILED
```

For the POC, failed transactions must not change authoritative monetary state.

## 9. LLM architecture

LLM input:
- agent personality
- agent economic state
- needs
- available actions
- relevant market summary
- recent memory
- current day

LLM output must be structured:

```json
{
  "action": "START_RESTAURANT",
  "targetId": null,
  "amount": 200,
  "reasonCode": "HIGH_CONFIDENCE_HIGH_RISK"
}
```

No free-form tool execution.

The backend validates every field.

## 10. Cost control

Maximum:
- one meaningful LLM decision per agent per game day.
- routine operations are deterministic.

20–50 agents × 30 days = 600–1500 primary decisions per simulation.

Cache static personality information and keep prompts compact.

## 11. Realtime

Use Supabase realtime for:
- simulation started
- day changed
- transaction event
- business created
- business failed
- loan taken
- loan repaid
- major shock
- final simulation

The simulation engine remains server-side.

## 12. Security

Never trust:
- frontend balances
- frontend action requests
- frontend personality scores
- frontend reputation
- frontend transaction amount

All are validated server-side.

Private questionnaire/personality data must never be placed on-chain.

## 13. Determinism

Every simulation gets:
- simulationId
- random seed
- rules version
- prompt version
- model identifier

Persist meaningful agent decisions and economic events.

This makes runs auditable and comparable.
