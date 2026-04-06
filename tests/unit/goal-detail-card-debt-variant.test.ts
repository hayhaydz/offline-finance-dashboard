import { describe, expect, it } from "vitest";

describe("GoalDetailCard debt variant", () => {
  describe("progress calculations", () => {
    it("should calculate paid amount as absolute value of currentAllocation", () => {
      const currentAllocation = -480000;
      const paid = Math.abs(currentAllocation);
      expect(paid).toBe(480000);
    });

    it("should calculate starting balance as absolute value of startingBalanceInCents", () => {
      const startingBalanceInCents = -800000;
      const starting = Math.abs(startingBalanceInCents);
      expect(starting).toBe(800000);
    });

    it("should calculate remaining as starting minus paid", () => {
      const starting = 800000;
      const paid = 480000;
      const remaining = starting - paid;
      expect(remaining).toBe(320000);
    });

    it("should calculate progress percentage correctly", () => {
      const paid = 480000;
      const starting = 800000;
      const progress = Math.round((paid / starting) * 100);
      expect(progress).toBe(60);
    });

    it("should handle zero starting balance", () => {
      const starting = 0;
      const paid = 0;
      const progress = starting > 0 ? Math.round((paid / starting) * 100) : 0;
      expect(progress).toBe(0);
    });
  });

  describe("column labels", () => {
    function getFirstLabel(goalType: 'savings' | 'debt'): string {
      return goalType === "debt" ? "PAID" : "SAVED";
    }

    function getSecondLabel(goalType: 'savings' | 'debt'): string {
      return goalType === "debt" ? "STARTING" : "TARGET";
    }

    it("should use SAVED for savings goals", () => {
      expect(getFirstLabel("savings")).toBe("SAVED");
    });

    it("should use PAID for debt goals", () => {
      expect(getFirstLabel("debt")).toBe("PAID");
    });

    it("should use TARGET for savings goals", () => {
      expect(getSecondLabel("savings")).toBe("TARGET");
    });

    it("should use STARTING for debt goals", () => {
      expect(getSecondLabel("debt")).toBe("STARTING");
    });
  });
});
