# EconForge — End-to-End Flow

## 1. User onboarding

```text
User
 |
 v
Supabase Auth
 |
 v
Create User
 |
 v
Questionnaire
 |
 v
Behavioral Profile
 |
 +--> Risk
 +--> Spending
 +--> Ethics
 +--> Confidence
 +--> FOMO
 |
 v
Create Agent Profile
 |
 v
Ready
```

## 2. Questionnaire flow

The questionnaire should use scenario questions.

Example:

```text
You have 100 coins.

Option A:
Receive 110 tomorrow with certainty.

Option B:
50% chance of 250.
50% chance of 0.

Your choice?
```

Backend maps responses to normalized tendencies.

Never allow frontend to submit arbitrary final personality scores.

## 3. Simulation creation

```text
POST /simulations
 |
 v
Create simulation
 |
 +--> rulesVersion
 +--> randomSeed
 +--> duration=30
 +--> taxRate=2%
 |
 v
Load participating agents
 |
 v
Clone required simulation state
 |
 v
INITIALIZE
```

## 4. Daily simulation

```text
DAY START
 |
 +--> update hunger
 |
 +--> process production
 |
 +--> process business operations
 |
 +--> pay/record wages
 |
 +--> process food consumption
 |
 +--> process loan maturities
 |
 +--> apply scheduled events
 |
 +--> generate agent observations
 |
 +--> generate candidate actions
 |
 +--> invoke agent decisions
 |
 +--> validate actions
 |
 +--> execute actions
 |
 +--> update reputation
 |
 +--> update activity
 |
 +--> calculate derived analytics
 |
 +--> persist state
 |
 +--> emit realtime events
 |
 v
DAY END
 |
 v
NEXT DAY
```

## 5. Agent decision flow

```text
Agent state
 |
 v
Need check
 |
 +--> Hungry?
 +--> Debt due?
 +--> Unemployed?
 +--> Business opportunity?
 +--> Cash available?
 |
 v
Generate valid candidate actions
 |
 v
Apply personality context
 |
 v
LLM
 |
 v
Structured action
 |
 v
Schema validation
 |
 v
Economic validation
 |
 +--> invalid -> reject
 |
 +--> valid -> execute
```

## 6. Purchase flow

```text
Buyer chooses purchase
 |
 v
Node validates:
- item
- seller
- quantity
- price
- buyer funds
 |
 v
LedgerService.transfer()
 |
 v
Monad
 |
 +--> recipient gets amount - tax
 |
 +--> treasury gets tax
 |
 v
txHash
 |
 v
MongoDB transaction record
 |
 v
Update item/ownership state
 |
 v
Realtime event
```

## 7. Business creation

```text
Agent chooses START_RESTAURANT
 |
 v
Check:
- enough cash
- property available
- no conflicting ownership
 |
 v
Buy/build property
 |
 v
Find 2 workers
 |
 v
Set wage
 |
 v
Business ACTIVE
```

If workers cannot be retained/paid:
```text
ACTIVE
 |
 v
operating failure
 |
 v
3 consecutive failed days
 |
 v
FAILED
```

## 8. Farm flow

```text
Farm
 |
 +--> 2 workers
 |
 +--> 40 wage/day
 |
 v
Produce 10 food
 |
 v
Food inventory
 |
 v
Restaurant purchases
```

## 9. Restaurant flow

```text
Restaurant
 |
 +--> 2 workers
 +--> food input
 |
 v
Convert food -> meals
 |
 v
Set ticket/meal price
 |
 v
Players purchase
 |
 v
Revenue
```

## 10. Theatre flow

```text
Theatre
 |
 +--> 2 workers
 |
 v
Players evaluate visit
 |
 +--> spending
 +--> FOMO
 +--> cash
 +--> hunger/needs
 |
 v
Ticket purchase
 |
 v
Revenue
 |
 v
Activity +2
```

## 11. Loan flow

```text
Agent requests loan
 |
 v
Check:
- outstanding overdue loan = false
- requested <= 50% net worth
- requested <= treasury balance
 |
 v
Treasury funds loan
 |
 v
Loan record created
 |
 v
Agent debt increases
 |
 v
Activity +2
```

Repayment:

```text
Due date
 |
 +--> paid
 |     |
 |     +--> principal decreases
 |     +--> interest -> treasury
 |     +--> reputation +5
 |
 +--> late
 |     |
 |     +--> reputation -5
 |
 +--> default
       |
       +--> collateral seized
       +--> reputation -10
```

## 12. Reputation flow

```text
Economic event
 |
 v
Reputation rule
 |
 v
Clamp 0..100
 |
 v
Append history
 |
 v
Persist
```

Reputation never gates actions.

## 13. Activity flow

```text
Participation event
 |
 v
Activity delta
 |
 v
Append history
 |
 v
Persist
```

Activity is descriptive only.

## 14. Simulation completion

```text
Day 30
 |
 v
Stop agents
 |
 v
Calculate final net worth
 |
 v
Calculate:
- Gini
- median
- average
- top 10%
- business survival
- defaults
- wages
- transactions
- treasury
 |
 v
Persist final snapshot
 |
 v
Mark simulation COMPLETE
 |
 v
React displays results
```

## 15. Replay flow

```text
simulationId
 +
randomSeed
 +
rulesVersion
 +
promptVersion
 +
stored decisions/events
 |
 v
Replay engine
 |
 v
Compare state snapshots
 |
 v
Detect divergence
```

## 16. Failure handling

Blockchain failure:
- transaction remains PENDING/FAILED.
- do not mutate authoritative monetary state.
- retry only when safe.

LLM failure:
- choose deterministic fallback action.
- record fallback.
- simulation continues.

MongoDB failure:
- pause simulation.
- do not advance day.

Invalid agent action:
- reject.
- record reason.
- optionally allow one retry.
- never execute invalid action.

## 17. Core invariant flow

For every monetary transaction:

```text
grossAmount = recipientAmount + tax

tax = grossAmount * 0.02

recipientAmount = grossAmount - tax
```

For every business:

```text
activeBusiness => employeeCount >= 2
```

For every loan:

```text
loanAmount <= 0.5 * netWorthAtApproval
loanAmount <= treasuryAvailable
```

For treasury:

```text
treasuryBalance >= 0
```

For reputation:

```text
0 <= reputation <= 100
```
