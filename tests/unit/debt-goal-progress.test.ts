import { describe, expect, it } from "vitest";
import { getDebtGoalProgress } from "$lib/server/goals";

describe("getDebtGoalProgress", () => {
  it("calculates progress when debt has decreased", () => {
    const result = getDebtGoalProgress({
      startingBalanceInCents: -320000, // -£3,200
      currentBalanceInCents: -180000,   // -£1,800
    });
    expect(result.paidInCents).toBe(140000); // £1,400 paid
    expect(result.totalInCents).toBe(320000); // £3,200 total
    expect(result.percent).toBe(43.75);
    expect(result.remainingInCents).toBe(180000); // £1,800 remaining
  });

  it("handles zero remaining balance", () => {
    const result = getDebtGoalProgress({
      startingBalanceInCents: -320000,
      currentBalanceInCents: 0,
    });
    expect(result.percent).toBe(100);
    expect(result.remainingInCents).toBe(0);
  });

  it("handles backward progress (new charges)", () => {
    const result = getDebtGoalProgress({
      startingBalanceInCents: -320000,
      currentBalanceInCents: -350000, // Increased debt
    });
    expect(result.paidInCents).toBe(-30000); // Negative = went backwards
    expect(result.percent).toBeCloseTo(-9.38, 1);
  });
});
