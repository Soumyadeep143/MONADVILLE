// Rules constants — single source of truth, mirrors docs/prd.md.
// Anything with a Bps suffix is basis points (1/100 of a percent): 200 bps = 2%.

export const RULES_VERSION = "v1";
export const PROMPT_VERSION = "v1";

export const STARTING_CASH = 1000;
export const STARTING_REPUTATION = 50;

export const TRANSACTION_TAX_BPS = 200; // 2%

export const WORKER_WAGE = 20; // coins per employee per day
export const BUSINESS_WORKERS_REQUIRED = 2;
export const BUSINESS_WAGE_COST = WORKER_WAGE * BUSINESS_WORKERS_REQUIRED; // 40/day
export const BUSINESS_FAILURE_DAYS = 3; // consecutive unpaid/inactive days -> FAILED

export const LAND_VALUE = 100;
export const CONSTRUCTION_VALUE = 100;
export const BUSINESS_PROPERTY_COST = LAND_VALUE + CONSTRUCTION_VALUE; // 200

export const FARM_DAILY_OUTPUT = 10; // food/day
export const MEALS_REQUIRED_PER_DAY = 1;

// prd.md leaves exact pricing to "the restaurant/theatre chooses" — these are
// the starting prices businesses launch with; owners can be given price-setting
// as a future action without changing anything downstream of `business.price`.
export const FOOD_UNIT_PRICE = 5; // restaurant buying food from a farm, per unit
export const DEFAULT_MEAL_PRICE = 10;
export const DEFAULT_TICKET_PRICE = 15;

export const LOAN_MAX_PERCENT_BPS = 5000; // 50% of net worth
export const LOAN_INTEREST_BPS = 1000; // 10%
export const LOAN_DURATION_DAYS = 10;
// prd.md doesn't specify a grace window past dueDay before a loan actually
// defaults, only that an "overdue" loan blocks taking a new one and that
// late repayment carries a smaller penalty than default. This is the POC's
// chosen grace period: overdue-but-still-payable for this many days, then default.
export const LOAN_DEFAULT_GRACE_DAYS = 3;

export const SIMULATION_DURATION_DAYS = 30;
export const MIN_AGENTS = 20;
export const MAX_AGENTS = 50;

// A "game day" is a simulation tick, not a throttle on decision frequency.
// Deterministic upkeep (production/wages/hunger/loan maturity) runs once per
// day, but each agent runs this many full decide->execute->complete cycles
// within that day — recalculating state and generating fresh candidate
// options before every cycle, never queuing a second decision while one is
// still executing.
export const DECISION_CYCLES_PER_DAY = 3;

export const REPUTATION_DELTA = {
  LOAN_REPAID_ON_TIME: 5,
  WAGES_PAID_ON_TIME: 2,
  TRADE_COMPLETED: 1,
  AGREEMENT_HONORED: 2,
  LATE_REPAYMENT: -5,
  LOAN_DEFAULT: -10,
  UNPAID_WAGES: -5,
  BROKEN_AGREEMENT: -3,
} as const;

export const ACTIVITY_DELTA = {
  BUY_MEAL: 1,
  THEATRE_VISIT: 2,
  WORK_DAY: 1,
  START_BUSINESS: 5,
  BUY_PROPERTY: 3,
  SELL_PROPERTY: 2,
  TAKE_LOAN: 2,
  TRADE: 1,
  REPAY_LOAN: 2,
} as const;

export function bps(amount: number, basisPoints: number): number {
  return Math.round(amount * (basisPoints / 10000) * 100) / 100;
}
