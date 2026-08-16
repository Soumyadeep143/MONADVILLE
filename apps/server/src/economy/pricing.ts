import type { BusinessType } from "@econforge/shared";
import {
  DEFAULT_MEAL_PRICE,
  DEFAULT_TICKET_PRICE,
  MAX_PRICE_MULTIPLIER,
  MIN_MEAL_PRICE,
  MIN_TICKET_PRICE,
  MONOPOLY_DRIFT_STEP_BPS,
  PRICE_ADJUSTMENT_STEP_BPS,
  bps,
} from "@econforge/shared";
import type { EconomyContext } from "./context.js";

/**
 * Deterministic per-day price adjustment for RESTAURANT/THEATRE businesses —
 * no agent decision involved, matching prd.md §20's expectation that the
 * rules "naturally create" Bertrand-style competition and monopoly pricing
 * power rather than an explicit SET_PRICE action:
 *
 * - Undercut the cheapest same-type competitor when you're not already the
 *   cheapest (race to the bottom, floored so it can't go to zero).
 * - When you're already the cheapest and sold out (restaurants only — meals
 *   inventory is the demand signal), drift the price up.
 * - With no competitors at all, drift up slowly on pure monopoly power.
 */
export async function adjustPrices(ctx: EconomyContext, simulationId: string): Promise<void> {
  for (const type of ["RESTAURANT", "THEATRE"] as const) {
    await adjustPricesForType(ctx, simulationId, type);
  }
}

async function adjustPricesForType(ctx: EconomyContext, simulationId: string, type: BusinessType): Promise<void> {
  const businesses = await ctx.repos.businesses.findBySimulation(simulationId, { type, status: "ACTIVE" });
  if (businesses.length === 0) return;

  const basePrice = type === "RESTAURANT" ? DEFAULT_MEAL_PRICE : DEFAULT_TICKET_PRICE;
  const minPrice = type === "RESTAURANT" ? MIN_MEAL_PRICE : MIN_TICKET_PRICE;
  const maxPrice = basePrice * MAX_PRICE_MULTIPLIER;

  for (const business of businesses) {
    const competitors = businesses.filter((b) => b.id !== business.id);
    let newPrice = business.price;

    if (competitors.length === 0) {
      newPrice = business.price + bps(business.price, MONOPOLY_DRIFT_STEP_BPS);
    } else {
      const cheapestCompetitor = Math.min(...competitors.map((c) => c.price));
      if (business.price > cheapestCompetitor) {
        newPrice = business.price - bps(business.price, PRICE_ADJUSTMENT_STEP_BPS);
      } else if (type === "RESTAURANT" && business.inventory.meals === 0) {
        newPrice = business.price + bps(business.price, PRICE_ADJUSTMENT_STEP_BPS);
      }
    }

    newPrice = Math.round(Math.min(maxPrice, Math.max(minPrice, newPrice)) * 100) / 100;
    if (newPrice !== business.price) {
      await ctx.repos.businesses.update(business.id, { price: newPrice });
    }
  }
}
