# EconForge — Product Requirements Document

## 1. Product

EconForge is a controlled multi-agent economic simulation POC built on top of IslandEscape. A user completes a short behavioral questionnaire. The system converts answers into five behavioral tendencies, then an autonomous AI agent uses those tendencies to act inside a closed economy.

Every player starts with identical economic resources. Agents can work, consume, trade, create businesses, hire workers, buy property, take treasury-funded loans, repay debt, and interact with a small number of markets.

The purpose is both:
1. A playable autonomous-agent economy.
2. A controlled experiment for observing how heterogeneous behavioral tendencies produce differences in wealth, participation, business outcomes, and inequality.

## 2. Goals

### Must have
- 20–50 autonomous agents per simulation.
- Identical starting economic conditions.
- Questionnaire-derived behavioral profile.
- Five tendencies: risk, spending, ethics, confidence, FOMO.
- Autonomous daily decision making.
- Closed economy.
- Four economic sectors:
  - farmland
  - restaurants
  - theatres
  - property/construction
- Every business requires exactly two employees.
- Wage system.
- Food/meal requirement.
- 2% transaction tax.
- Monad economic ledger.
- State treasury.
- Treasury-funded loans.
- Loan interest and collateral/default.
- Persistent user/agent profile.
- Debt history and reputation history.
- Reputation does not affect economic access or usage.
- Activity/liveliness score separate from reputation.
- 30-day simulation.
- Gini coefficient and basic economic analytics.
- React dashboard.
- Node.js simulation backend.
- MongoDB for simulation state.
- Supabase for authentication/realtime/user-facing infrastructure.

### Explicitly not in POC
- Stocks
- Insurance
- complex banking
- government welfare
- multiple currencies
- advanced NPC population dynamics
- healthcare
- transport economy
- complex manufacturing
- political systems
- fully on-chain world state
- 10,000+ agents
- claims that questionnaire scores are scientifically validated personality measurements

## 3. Non-goals

EconForge is not intended to reproduce a real national economy. It is a stylized closed economy designed for controlled experiments and gameplay.

Behavioral traits should be described as behavioral tendencies, not clinically or scientifically validated personality measurements.

## 4. Core user journey

1. User signs in.
2. User completes questionnaire.
3. Backend derives five behavioral tendencies.
4. User reviews their generated agent profile.
5. User starts or joins a simulation.
6. Simulation starts with identical player capital.
7. Agents act autonomously once per game day.
8. World state changes through deterministic game rules.
9. Valid monetary transfers are settled through the economic ledger.
10. Transaction tax flows to treasury.
11. Treasury funds eligible loans.
12. Reputation/activity/history are updated.
13. User watches the world and their profile.
14. After 30 days, simulation ends.
15. Results show wealth, inequality, business outcomes, reputation, activity, and other statistics.

## 5. Starting state

Every agent:
- cash: 1000
- outstanding debt: 0
- reputation: 50
- activity score: 0
- assets: 0
- businesses: 0
- employment: none
- hunger: 0

The only intentionally different starting input is the behavioral profile.

## 6. Behavioral profile

All tendencies are normalized 0–100:
- Risk: willingness to accept uncertainty.
- Spending: propensity to consume rather than save.
- Ethics: preference for reliable/fair behavior.
- Confidence: willingness to initiate businesses and negotiations.
- FOMO: sensitivity to trends and recent market activity.

Questionnaire questions should use concrete choices and scenarios rather than asking users to self-label.

The questionnaire is an input mechanism, not a validated psychological assessment.

## 7. Economic profile

Each agent maintains:
- current cash
- outstanding debt
- historical borrowed amount
- total repaid
- total interest paid
- assets
- businesses
- income
- expenses
- employment
- transaction count
- food/meal state
- reputation
- activity

`netWorth = cash + markedAssetValue - outstandingDebt`

## 8. Reputation vs activity

### Reputation
Represents reliability/responsibility.

Starts at 50 and remains 0–100.

Example changes:
- loan repaid on time: +5
- wages paid on time: +2
- completed trade: +1
- honored agreement: +2
- late repayment: -5
- loan default: -10
- unpaid wages: -5
- broken agreement: -3

Reputation does NOT affect:
- prices
- loan eligibility
- business access
- employment access
- transaction permissions

### Activity score
Measures how alive/active the agent was in the economy.

Example:
- buy meal: +1
- theatre visit: +2
- work a day: +1
- start business: +5
- buy property: +3
- sell property: +2
- take loan: +2
- trade: +1
- repay loan: +2

Activity is used for evaluation and final analytics, not as economic power.

## 9. Businesses

### Farm
- Requires land + construction.
- Requires 2 workers.
- Produces food.
- Example output: 10 food/day.
- Has operating wages of 40/day.

### Restaurant
- Requires land + construction.
- Requires 2 workers.
- Buys food from farms.
- Converts food into meals.
- Players require 1 meal/day.
- Restaurant chooses selling price.

### Theatre
- Requires land + construction.
- Requires 2 workers.
- Sells entertainment tickets.
- Attendance depends on cash, spending tendency, FOMO, and current conditions.

### Property/construction
For the POC, property is a simple asset rather than a separate AI business.
- Land: 100 coins.
- Construction: 100 coins.
- Business property cost: 200 coins.
- Properties can be bought/sold between players.

## 10. Labor

Every active business must have exactly 2 employees minimum.

Owner cannot count themselves.

Default wage:
- 20 coins per employee per day.
- Business wage cost: 40 coins/day.

Workers can move between businesses according to available opportunities and their decision policy.

Businesses unable to pay required wages cannot operate normally.

## 11. Food

Every player needs 1 meal/day.

A restaurant converts food to meals.

No complex health model is required for POC.

If a player cannot obtain a meal, hunger increases and this becomes a decision pressure for the next day.

## 12. Transaction tax

Tax rate:
- 2%.

For a 100-coin transfer:
- recipient receives 98
- treasury receives 2

The tax is an economic policy, not blockchain gas.

Taxed:
- player-to-player purchases
- food purchases
- meals
- property
- wages
- business purchases
- loan repayment
- interest payments
- other actual monetary transfers

Not taxed:
- hunger updates
- reputation updates
- production
- AI decisions
- movement
- internal state changes

## 13. Treasury

Treasury receives:
- transaction taxes
- loan interest
- assets/collateral obtained from defaults

Treasury pays:
- loans
- approved treasury economic operations

POC rule:
- Treasury cannot create arbitrary new money.
- Treasury can only lend available treasury funds.

This keeps the monetary system closed and auditable.

## 14. Loans

Default rules:
- maximum loan: 50% of current net worth
- interest: 10%
- duration: 10 game days
- no overdue loan may exist before taking another loan

Loan amount cannot exceed treasury liquidity.

Repayment:
`repayment = principal + interest`

Default:
- collateral is seized.
- loan is marked defaulted.
- reputation decreases.
- activity still records the event.

No complex credit score in POC.

## 15. Business failure

A business is inactive if it cannot meet its operating requirements.

If it remains unable to operate for 3 consecutive days:
- business status becomes FAILED
- property remains owned by the player
- player may restart or sell the property

## 16. Agent decision system

Each game day:
1. deterministic needs update
2. deterministic production
3. wages
4. consumption
5. loan processing
6. market observation
7. candidate actions generated
8. personality modifiers applied
9. LLM selects a valid candidate
10. engine validates
11. transaction/state execution
12. reputation/activity update
13. persistence

Routine calculations must not require an LLM.

LLM is a decision layer, never the source of truth.

## 17. Candidate actions

Initial action set:
- WORK
- BUY_MEAL
- VISIT_THEATRE
- BUY_PROPERTY
- SELL_PROPERTY
- START_FARM
- START_RESTAURANT
- START_THEATRE
- TAKE_LOAN
- REPAY_LOAN
- SAVE
- BUY_GOOD
- SELL_GOOD

Only actions valid for the current state should be offered.

## 18. Personality-to-decision behavior

Risk:
- increases willingness to take loans and start uncertain businesses.

Spending:
- increases discretionary consumption and theatre visits.

Ethics:
- increases preference for paying wages and honoring agreements.

Confidence:
- increases business creation and negotiation attempts.

FOMO:
- increases response to price increases, trends, and popular activities.

These are behavioral modifiers, not direct scripted outcomes.

## 19. Economic shocks

Only three POC shocks:
- Food shortage: farm output temporarily decreases.
- Property boom: property prices temporarily increase.
- Theatre trend: theatre demand temporarily increases.

Shocks are deterministic under a simulation seed.

## 20. Economic/game-theory mechanisms

The rules naturally create:
- Bertrand-style restaurant price competition.
- labor market competition.
- monopoly/market concentration.
- risk/reward decisions.
- repeated-game cooperation and betrayal.
- coordination failure.
- overinvestment.
- FOMO-driven bubbles.
- poverty/wealth feedback loops.
- business collapse.

No explicit game-theory solver is required.

## 21. Winner and evaluation

Do not collapse everything into one score.

Leaderboards:
- Wealth winner: highest net worth.
- Reputation leader: highest reputation.
- Activity leader: highest activity.
- Entrepreneur leader: most successful business wealth/revenue.

Primary economic outcome:
- wealth distribution and Gini coefficient.

## 22. Research/experiment mode

Run repeated simulations with:
- same rules
- same starting wealth
- controlled random seed
- controlled agent count
- controlled personality distributions

Recommended baseline:
1. Rational/utility baseline agents.
2. Random valid-action baseline.
3. Personality-driven agents.

Compare:
- mean wealth
- median wealth
- Gini
- top 10% wealth share
- bankruptcy/default rate
- business count
- business survival
- average wage
- transaction volume
- treasury balance

## 23. Acceptance criteria

A POC is complete when:
- 20 agents can complete 30 days without manual intervention.
- Every monetary action is validated by the backend.
- Invalid actions cannot modify state.
- Treasury never becomes negative.
- Agent debt cannot become negative.
- Business cannot operate without two employees.
- Money is conserved except for explicitly defined creation/destruction mechanisms.
- Tax is applied exactly once per taxable transfer.
- MongoDB and on-chain economic records can be reconciled.
- A simulation can be replayed from a stored seed and event log.
- Final analytics calculate successfully.
