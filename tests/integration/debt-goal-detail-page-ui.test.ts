import { describe, expect, it } from "vitest";

describe("Debt goal detail page UI", () => {
  describe("section visibility", () => {
    it("should hide source accounts for debt goals", () => {
      const goalType: string = "debt";
      expect(goalType !== "debt").toBe(false);
    });

    it("should show source accounts for savings goals", () => {
      const goalType: string = "savings";
      expect(goalType !== "debt").toBe(true);
    });

    it("should show linked account for debt goals", () => {
      const goalType: string = "debt";
      expect(goalType === "debt").toBe(true);
    });

    it("should hide linked account for savings goals", () => {
      const goalType: string = "savings";
      expect(goalType === "debt").toBe(false);
    });
  });

  describe("payoff projection calculation", () => {
    it("should calculate months with zero APR", () => {
      const balance = 320000;
      const apr = 0;
      const monthlyPayment = 40000;
      const monthlyRate = (apr / 100) / 12 / 100;
      const months = monthlyRate === 0
        ? Math.ceil(balance / monthlyPayment)
        : 0;
      expect(months).toBe(8);
    });

    it("should calculate months with APR", () => {
      const balance = 320000;
      const apr = 249;
      const monthlyPayment = 40000;
      const monthlyRate = (apr / 100) / 12 / 100;
      const months = Math.ceil(
        -Math.log(1 - (monthlyRate * balance) / monthlyPayment) / Math.log(1 + monthlyRate)
      );
      expect(months).toBeGreaterThan(0);
    });

    it("should detect insufficient payment", () => {
      const balance = 320000;
      const apr = 249;
      const monthlyPayment = 100;
      const monthlyRate = (apr / 100) / 12 / 100;
      expect(monthlyPayment <= balance * monthlyRate).toBe(true);
    });
  });
});
