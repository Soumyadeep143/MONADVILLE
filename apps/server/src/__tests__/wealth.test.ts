import { describe, it, expect } from "vitest";
import { gini, median, average, top10WealthShare } from "../analytics/wealth.js";

describe("wealth statistics", () => {
  it("gini is 0 for perfect equality", () => {
    expect(gini([100, 100, 100, 100])).toBeCloseTo(0, 5);
  });

  it("gini approaches 1 for extreme inequality", () => {
    const values = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1000];
    expect(gini(values)).toBeGreaterThan(0.85);
  });

  it("gini is between 0 and 1 for a mixed distribution", () => {
    const g = gini([100, 250, 400, 900, 1500]);
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(1);
  });

  it("median handles even and odd counts", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("average is the arithmetic mean", () => {
    expect(average([10, 20, 30])).toBe(20);
  });

  it("top10WealthShare rounds the cutoff up to at least one agent", () => {
    const values = [10, 10, 10, 10, 10, 10, 10, 10, 10, 100]; // 10 agents, richest holds ~52.6%
    const share = top10WealthShare(values);
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThanOrEqual(1);
  });
});
