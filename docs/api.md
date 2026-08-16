# EconForge — API Specification

## 1. API conventions

Base:
`/api/v1`

JSON request/response.

Authentication:
Supabase JWT in:
`Authorization: Bearer <token>`

All simulation mutations require authenticated users and server-side authorization.

## 2. Health

### GET /health

Response:

```json
{
  "status": "ok",
  "service": "econforge-api"
}
```

## 3. User profile

### GET /me

Returns:

```json
{
  "id": "uuid",
  "displayName": "Zrypton",
  "agentCount": 1
}
```

## 4. Questionnaire

### GET /questionnaire

Returns questionnaire definition.

```json
{
  "version": "v1",
  "questions": [
    {
      "id": "risk_01",
      "type": "CHOICE",
      "text": "You have 100 coins...",
      "options": [
        {"id": "safe", "label": "Guaranteed 110"},
        {"id": "risky", "label": "50% chance of 250"}
      ]
    }
  ]
}
```

### POST /questionnaire/submit

Request:

```json
{
  "version": "v1",
  "answers": [
    {"questionId": "risk_01", "optionId": "risky"}
  ]
}
```

Backend derives traits.

Response:

```json
{
  "personality": {
    "risk": 82,
    "spending": 61,
    "ethics": 44,
    "confidence": 77,
    "fomo": 70
  }
}
```

Never accept client-submitted final trait scores as authoritative.

## 5. Agent

### GET /agents/:agentId

Returns:
- personality
- cash
- debt
- assets
- businesses
- reputation
- activity
- statistics

Do not return private questionnaire answers unless required.

### GET /agents/:agentId/history

Query:
- `type`
- `fromDay`
- `toDay`
- `limit`

Returns events and economic history.

## 6. Simulations

### POST /simulations

Request:

```json
{
  "name": "Baseline Experiment",
  "durationDays": 30,
  "agentIds": ["agent1", "agent2"]
}
```

Server assigns seed and rules version.

Response:

```json
{
  "simulationId": "sim_123",
  "status": "CREATED",
  "rulesVersion": "v1",
  "randomSeed": 92838171
}
```

### GET /simulations/:simulationId

Returns:
- status
- current day
- duration
- rules
- participants
- metrics

### POST /simulations/:simulationId/start

Starts simulation.

### POST /simulations/:simulationId/pause

Pauses simulation.

### POST /simulations/:simulationId/resume

Resumes simulation.

### POST /simulations/:simulationId/stop

Stops simulation early.

## 7. World

### GET /simulations/:simulationId/world

Returns:
- properties
- businesses
- active agents
- prices
- treasury summary
- current day

### GET /simulations/:simulationId/events

Query:
- `day`
- `type`
- `limit`

Returns event feed.

## 8. Economy

### GET /simulations/:simulationId/economy

Returns:

```json
{
  "day": 12,
  "moneySupply": 20000,
  "treasuryBalance": 412,
  "averageWealth": 1000,
  "medianWealth": 890,
  "gini": 0.41,
  "top10WealthShare": 0.29,
  "businesses": {
    "farms": 5,
    "restaurants": 8,
    "theatres": 2
  },
  "averageWage": 20
}
```

### GET /simulations/:simulationId/leaderboard

Supports:
- `wealth`
- `reputation`
- `activity`
- `business`

## 9. Businesses

### GET /simulations/:simulationId/businesses

Optional:
- `type`
- `ownerId`
- `status`

### GET /businesses/:businessId

Returns business details.

Direct business creation from frontend should generally not be allowed because agents are autonomous. For testing/admin mode, an internal endpoint may be provided.

## 10. Loans

### GET /simulations/:simulationId/loans

Returns loan summary.

### GET /agents/:agentId/loans

Returns:
- active loans
- historical loans
- total borrowed
- total repaid
- total interest
- defaults

Agent actions such as taking/repaying loans should go through the agent decision engine during simulation.

Admin/testing endpoints can exist separately and must be disabled in normal gameplay.

## 11. Transactions

### GET /simulations/:simulationId/transactions

Query:
- `agentId`
- `type`
- `day`
- `status`
- `limit`

Returns ledger-linked transactions.

### GET /transactions/:transactionId

Returns:
- gross amount
- tax
- net amount
- sender
- recipient
- tx hash
- game day
- status

## 12. Analytics

### GET /simulations/:simulationId/analytics

Returns:

```json
{
  "wealth": {
    "average": 1240,
    "median": 1010,
    "gini": 0.54,
    "top10Share": 0.37
  },
  "business": {
    "created": 21,
    "failed": 7,
    "survivalRate": 0.67
  },
  "labor": {
    "averageWage": 20,
    "employmentRate": 0.81
  },
  "finance": {
    "loansIssued": 12,
    "defaults": 3,
    "treasuryBalance": 700
  },
  "activity": {
    "average": 81,
    "highest": 142
  }
}
```

## 13. Realtime events

Supabase realtime channels:

`simulation:<simulationId>`

Event examples:

```json
{
  "type": "DAY_STARTED",
  "day": 13
}
```

```json
{
  "type": "TRANSACTION",
  "agentId": "A12",
  "amount": 100,
  "tax": 2
}
```

```json
{
  "type": "BUSINESS_CREATED",
  "agentId": "A4",
  "businessType": "RESTAURANT"
}
```

```json
{
  "type": "LOAN_DEFAULTED",
  "agentId": "A7"
}
```

## 14. Error format

All API errors:

```json
{
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Agent does not have enough available funds.",
    "requestId": "req_123"
  }
}
```

## 15. Important error codes

- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `INVALID_ACTION`
- `INSUFFICIENT_FUNDS`
- `INSUFFICIENT_TREASURY`
- `INVALID_LOAN`
- `OVERDUE_LOAN`
- `INVALID_BUSINESS`
- `INSUFFICIENT_EMPLOYEES`
- `INVALID_PROPERTY`
- `BLOCKCHAIN_TRANSACTION_FAILED`
- `SIMULATION_NOT_RUNNING`
- `SIMULATION_ALREADY_COMPLETED`

## 16. Idempotency

Economic mutations should use an idempotency key.

Example:

```text
Idempotency-Key: sim_123_A12_day12_action7
```

This prevents duplicate transactions when requests/retries happen.

## 17. API security

The frontend cannot:
- set cash
- set debt
- set reputation
- create arbitrary money
- bypass taxes
- choose another agent's action
- alter simulation rules
- directly call treasury methods

All authoritative operations happen server-side.
