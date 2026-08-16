# EconForge — Database Design

## 1. Database strategy

Use:
- MongoDB for simulation/application state.
- Supabase Auth for authentication.
- Monad for authoritative economic ledger events.

Do not duplicate sensitive questionnaire data on-chain.

## 2. MongoDB collections

Initial collections:
- users
- agents
- simulations
- businesses
- properties
- transactions
- loans
- events
- agent_decisions

## 3. users

```json
{
  "_id": "ObjectId",
  "supabaseUserId": "uuid",
  "displayName": "string",
  "createdAt": "date",
  "updatedAt": "date"
}
```

Indexes:
- unique `supabaseUserId`

## 4. agents

```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "simulationId": "ObjectId",

  "personality": {
    "risk": 0,
    "spending": 0,
    "ethics": 0,
    "confidence": 0,
    "fomo": 0
  },

  "economic": {
    "cash": 1000,
    "outstandingDebt": 0,
    "totalBorrowed": 0,
    "totalRepaid": 0,
    "totalInterestPaid": 0,
    "totalIncome": 0,
    "totalExpenses": 0
  },

  "state": {
    "hunger": 0,
    "employmentStatus": "UNEMPLOYED",
    "employerId": null,
    "propertyIds": [],
    "businessIds": []
  },

  "reputation": {
    "score": 50,
    "history": []
  },

  "activity": {
    "score": 0,
    "history": []
  },

  "statistics": {
    "transactions": 0,
    "theatreVisits": 0,
    "loansTaken": 0,
    "loansRepaid": 0,
    "loansDefaulted": 0,
    "businessesCreated": 0,
    "businessesFailed": 0
  },

  "memory": [],
  "createdAt": "date",
  "updatedAt": "date"
}
```

Indexes:
- `simulationId`
- `userId + simulationId`

## 5. simulations

```json
{
  "_id": "ObjectId",
  "name": "string",
  "status": "CREATED|RUNNING|PAUSED|COMPLETED|FAILED",
  "rulesVersion": "v1",
  "promptVersion": "v1",
  "randomSeed": 123456,
  "durationDays": 30,
  "currentDay": 12,

  "rules": {
    "startingCash": 1000,
    "transactionTaxBps": 200,
    "workerWage": 20,
    "loanMaxPercentBps": 5000,
    "loanInterestBps": 1000,
    "loanDurationDays": 10,
    "businessWorkers": 2
  },

  "metrics": {
    "gini": 0,
    "averageWealth": 0,
    "medianWealth": 0,
    "top10WealthShare": 0,
    "treasuryBalance": 0
  },

  "createdAt": "date",
  "startedAt": "date",
  "completedAt": null
}
```

## 6. businesses

```json
{
  "_id": "ObjectId",
  "simulationId": "ObjectId",
  "ownerAgentId": "ObjectId",
  "type": "FARM|RESTAURANT|THEATRE",
  "propertyId": "ObjectId",

  "status": "ACTIVE|INACTIVE|FAILED",
  "employees": [
    {
      "agentId": "ObjectId",
      "wage": 20
    }
  ],

  "price": 5,
  "inventory": {
    "food": 0,
    "meals": 0
  },

  "statistics": {
    "revenue": 0,
    "expenses": 0,
    "profit": 0,
    "daysActive": 0,
    "failedDays": 0
  },

  "createdAt": "date",
  "updatedAt": "date"
}
```

Business invariant:
`status=ACTIVE => employees.length >= 2`

## 7. properties

```json
{
  "_id": "ObjectId",
  "simulationId": "ObjectId",
  "ownerAgentId": "ObjectId",
  "type": "LAND|FARM|RESTAURANT|THEATRE",
  "landValue": 100,
  "constructionValue": 100,
  "marketValue": 200,
  "businessId": null,
  "createdAt": "date",
  "updatedAt": "date"
}
```

## 8. transactions

MongoDB copy/index of the economic ledger.

```json
{
  "_id": "ObjectId",
  "simulationId": "ObjectId",
  "type": "TRANSFER|WAGE|PURCHASE|PROPERTY|LOAN|REPAYMENT|INTEREST",
  "fromAgentId": "ObjectId",
  "toAgentId": "ObjectId",
  "grossAmount": 100,
  "taxAmount": 2,
  "netAmount": 98,

  "blockchain": {
    "status": "PENDING|CONFIRMED|FAILED",
    "txHash": "0x...",
    "blockNumber": 123
  },

  "gameDay": 12,
  "createdAt": "date"
}
```

Indexes:
- `simulationId + gameDay`
- `blockchain.txHash`
- `fromAgentId`
- `toAgentId`

## 9. loans

```json
{
  "_id": "ObjectId",
  "simulationId": "ObjectId",
  "agentId": "ObjectId",
  "principal": 200,
  "outstandingPrincipal": 200,
  "interestRateBps": 1000,
  "interestAmount": 20,
  "totalRepayment": 220,
  "collateralPropertyId": "ObjectId",

  "status": "ACTIVE|REPAID|DEFAULTED",
  "issuedDay": 5,
  "dueDay": 15,

  "blockchain": {
    "creationTxHash": "0x...",
    "repaymentTxHash": null
  },

  "createdAt": "date",
  "updatedAt": "date"
}
```

## 10. events

```json
{
  "_id": "ObjectId",
  "simulationId": "ObjectId",
  "gameDay": 12,
  "type": "BUSINESS_CREATED|BUSINESS_FAILED|LOAN|REPAYMENT|DEFAULT|SHOCK|TRADE|THEATRE_VISIT",
  "agentIds": [],
  "message": "Agent 4 opened a restaurant",
  "metadata": {},
  "createdAt": "date"
}
```

## 11. agent_decisions

```json
{
  "_id": "ObjectId",
  "simulationId": "ObjectId",
  "agentId": "ObjectId",
  "gameDay": 12,
  "availableActions": [],
  "selectedAction": {
    "action": "START_RESTAURANT",
    "targetId": null,
    "amount": 200,
    "reasonCode": "HIGH_CONFIDENCE"
  },
  "source": "LLM|FALLBACK",
  "model": "string",
  "promptVersion": "v1",
  "createdAt": "date"
}
```

Do not store full chain-of-thought. Store concise structured reason codes/decision metadata.

## 12. Supabase tables

Keep Supabase minimal.

Use Supabase Auth as the identity system.

Optional public/user-facing table:
`profiles`
- id
- display_name
- avatar_url
- created_at

Do not duplicate the full simulation state in Supabase.

## 13. MongoDB vs Supabase

| Data | MongoDB | Supabase |
|---|---|---|
| Personality | Yes | No |
| Agent state | Yes | No |
| Businesses | Yes | No |
| Simulation | Yes | No |
| Decisions | Yes | No |
| Authentication | No | Yes |
| User profile | Optional | Yes |
| Realtime delivery | No | Yes |
| Economic ledger | Cache only | No |
| Blockchain truth | No | No |

## 14. Monetary consistency

MongoDB `economic.cash` is a cache/read model.

The ledger is authoritative.

Every confirmed transaction updates the cached balance.

A reconciliation job should periodically compare:
- expected ledger balance
- MongoDB cached balance

Any mismatch should pause or flag the simulation.

## 15. Privacy

Never store:
- questionnaire answers on-chain
- personality vector on-chain
- agent memory on-chain

Blockchain should expose only required economic events.
