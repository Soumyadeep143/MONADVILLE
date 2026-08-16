# EconForge — Roadmap

## Phase 0 — Project setup

### Deliverables
- [ ] Create monorepo.
- [ ] Create React app.
- [ ] Create Node API.
- [ ] Configure MongoDB.
- [ ] Configure Supabase auth.
- [ ] Configure Monad testnet wallet/contract project.
- [ ] Add shared TypeScript types/schemas.
- [ ] Add environment configuration.
- [ ] Add logging.

### Definition of done
Frontend can authenticate and call Node health endpoint.

---

## Phase 1 — Economic engine without AI/blockchain

Build the economy locally first.

### Implement
- [ ] Simulation object.
- [ ] 20 test agents.
- [ ] Starting balance 1000.
- [ ] Hunger.
- [ ] Food.
- [ ] Farms.
- [ ] Restaurants.
- [ ] Theatres.
- [ ] Properties.
- [ ] Workers.
- [ ] Wages.
- [ ] Production.
- [ ] Consumption.
- [ ] Business failure.
- [ ] Basic market prices.
- [ ] 30-day simulation.

### Definition of done
A 30-day simulation can run automatically with deterministic scripted agents.

---

## Phase 2 — Personal profile

### Implement
- [ ] Questionnaire UI.
- [ ] Scenario-based questions.
- [ ] Five behavioral tendency extraction.
- [ ] Store personality profile.
- [ ] Economic profile.
- [ ] Debt history.
- [ ] Reputation.
- [ ] Activity.
- [ ] Agent statistics.

### Definition of done
A user can complete the questionnaire and receive a persistent agent profile.

---

## Phase 3 — Autonomous agents

### Implement
- [ ] Candidate action generator.
- [ ] Personality modifiers.
- [ ] LLM decision prompt.
- [ ] Structured output.
- [ ] Backend action validator.
- [ ] Agent memory.
- [ ] One meaningful decision/day.
- [ ] Decision logging.

### Definition of done
20 agents can autonomously complete 30 days without invalid state changes.

---

## Phase 4 — Reputation/activity

### Implement
- [ ] Reputation rules.
- [ ] Activity rules.
- [ ] Reputation history.
- [ ] Activity history.
- [ ] Final profile.
- [ ] Separate leaderboards.

### Definition of done
Reputation and activity update correctly but never affect economic permissions.

---

## Phase 5 — Treasury and loans

### Implement
- [ ] Treasury model.
- [ ] 2% transaction tax.
- [ ] Loan creation.
- [ ] 50% net-worth limit.
- [ ] 10% interest.
- [ ] 10-day maturity.
- [ ] Repayment.
- [ ] Default.
- [ ] Collateral seizure.

### Definition of done
Treasury cannot go negative and cannot mint arbitrary money.

---

## Phase 6 — Monad ledger

### Implement
- [ ] EconomicLedger Solidity contract.
- [ ] Player registration/ledger identity.
- [ ] transfer.
- [ ] 2% tax.
- [ ] treasury.
- [ ] loan creation.
- [ ] repayment.
- [ ] event emission.
- [ ] transaction hash storage.
- [ ] reconciliation service.

### Definition of done
A test transaction produces correct recipient amount, tax, treasury amount, and persisted transaction hash.

---

## Phase 7 — UI

### Build
- [ ] World view.
- [ ] Agent profile.
- [ ] Economy dashboard.
- [ ] Live event feed.
- [ ] Leaderboards.
- [ ] Simulation controls.
- [ ] Final results.

### Definition of done
A user can watch an entire simulation from browser without backend access.

---

## Phase 8 — Analytics

### Implement
- [ ] Gini coefficient.
- [ ] Median wealth.
- [ ] Average wealth.
- [ ] Top 10% wealth share.
- [ ] Business survival.
- [ ] Bankruptcy/default rate.
- [ ] Average wage.
- [ ] Transaction volume.
- [ ] Treasury balance.
- [ ] Wealth trajectory.

### Definition of done
Every completed simulation produces a reproducible results object.

---

## Phase 9 — Controlled experiments

### Baselines
- [ ] Random valid-action agents.
- [ ] Simple rational utility agents.
- [ ] Personality-driven agents.

### Experiments
- [ ] homogeneous personality population.
- [ ] heterogeneous population.
- [ ] high-risk population.
- [ ] high-FOMO population.
- [ ] tax-rate comparison.
- [ ] loan-policy comparison.

### Definition of done
The same experiment can be repeated using a seed and compared statistically.

---

## Phase 10 — Demo hardening

- [ ] Error recovery.
- [ ] Failed blockchain transaction handling.
- [ ] Duplicate transaction protection.
- [ ] Simulation pause/resume.
- [ ] Seeded replay.
- [ ] Loading states.
- [ ] Agent action explanations.
- [ ] Final polished dashboard.

## Priority rule

If time becomes constrained, stop after Phase 7.

A polished:
- autonomous simulation
- four-sector economy
- personal profiles
- reputation/activity
- Monad tax/treasury
- dashboard

is already a strong POC.

Do not add new economic systems before the existing loop is stable.
