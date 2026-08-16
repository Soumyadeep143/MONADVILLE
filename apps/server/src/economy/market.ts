import { seededRandom } from "../simulation/random.js";

// prd.md §19 — exactly three POC shocks, deterministic under the simulation seed.
export type ShockType = "FOOD_SHORTAGE" | "PROPERTY_BOOM" | "THEATRE_TREND" | null;

export function getActiveShock(seed: number, day: number): ShockType {
  const r = seededRandom(seed, day, 1);
  if (r < 0.05) return "FOOD_SHORTAGE";
  if (r < 0.1) return "PROPERTY_BOOM";
  if (r < 0.15) return "THEATRE_TREND";
  return null;
}

/** Applied directly to that day's farm output (business.ts processDailyProduction). */
export function foodOutputMultiplier(shock: ShockType): number {
  return shock === "FOOD_SHORTAGE" ? 0.5 : 1;
}

/** Surfaced to agents/LLM as market context and in the event feed; informational for this pass (no peer property market yet — see economy/property.ts). */
export function propertyDemandMultiplier(shock: ShockType): number {
  return shock === "PROPERTY_BOOM" ? 1.5 : 1;
}

/** Surfaced to agents/LLM as market context; a FOMO-sensitive agent should weight VISIT_THEATRE higher when this is active. */
export function theatreDemandMultiplier(shock: ShockType): number {
  return shock === "THEATRE_TREND" ? 1.5 : 1;
}

export function shockMessage(shock: ShockType): string {
  switch (shock) {
    case "FOOD_SHORTAGE":
      return "A food shortage has hit farm output.";
    case "PROPERTY_BOOM":
      return "A property boom is driving prices up.";
    case "THEATRE_TREND":
      return "A theatre trend is driving demand up.";
    default:
      return "";
  }
}
