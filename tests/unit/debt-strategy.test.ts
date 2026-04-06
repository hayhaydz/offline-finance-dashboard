import { describe, expect, it } from "vitest";
import {
	calculatePayoffProjection,
	calculateStrategyOrder,
	calculateDebtStrategyMetrics,
} from "$lib/server/debt-strategy";

describe("calculatePayoffProjection", () => {
	it("calculates months to payoff with interest", () => {
		const result = calculatePayoffProjection({
			balanceInCents: 100000, // £1,000
			monthlyPaymentInCents: 10000, // £100/mo
			aprBasisPoints: 1200, // 12%
		});
		expect(result.months).toBe(11);
		expect(result.totalInterestInCents).toBeGreaterThan(0);
		expect(result.projectedPayoffDate).toBeInstanceOf(Date);
	});

	it("returns null months when payment cannot cover interest", () => {
		const result = calculatePayoffProjection({
			balanceInCents: 100000, // £1,000
			monthlyPaymentInCents: 500, // £5/mo
			aprBasisPoints: 3000, // 30%
		});
		expect(result.months).toBeNull();
		expect(result.totalInterestInCents).toBeNull();
	});

	it("returns 0 months when balance is zero", () => {
		const result = calculatePayoffProjection({
			balanceInCents: 0,
			monthlyPaymentInCents: 10000,
			aprBasisPoints: 1200,
		});
		expect(result.months).toBe(0);
		expect(result.totalInterestInCents).toBe(0);
	});

	it("calculates payoff without APR (0% interest)", () => {
		const result = calculatePayoffProjection({
			balanceInCents: 120000, // £1,200
			monthlyPaymentInCents: 10000, // £100/mo
			aprBasisPoints: 0,
		});
		expect(result.months).toBe(12);
		expect(result.totalInterestInCents).toBe(0);
	});
});

describe("calculateStrategyOrder", () => {
	const debts = [
		{
			goalId: 1,
			slug: "card-a",
			name: "Card A",
			remainingInCents: 50000,
			aprBasisPoints: 2990,
			minimumMonthlyInCents: 2500,
		},
		{
			goalId: 2,
			slug: "loan-b",
			name: "Loan B",
			remainingInCents: 450000,
			aprBasisPoints: 1250,
			minimumMonthlyInCents: 15000,
		},
		{
			goalId: 3,
			slug: "overdraft",
			name: "Overdraft",
			remainingInCents: 200000,
			aprBasisPoints: 3990,
			minimumMonthlyInCents: 5000,
		},
	];

	it("snowball sorts by remaining ascending (smallest first)", () => {
		const result = calculateStrategyOrder(debts, "snowball");
		expect(result.map((d) => d.slug)).toEqual(["card-a", "overdraft", "loan-b"]);
	});

	it("avalanche sorts by APR descending (highest first)", () => {
		const result = calculateStrategyOrder(debts, "avalanche");
		expect(result.map((d) => d.slug)).toEqual(["overdraft", "card-a", "loan-b"]);
	});

	it("hybrid: snowball for debts under £1,000 then avalanche", () => {
		const result = calculateStrategyOrder(debts, "hybrid");
		expect(result[0].slug).toBe("card-a"); // snowball (smallest, under £1k)
		expect(result.slice(1).map((d) => d.slug)).toEqual(["overdraft", "loan-b"]); // avalanche
	});
});

describe("calculateDebtStrategyMetrics", () => {
	const debts = [
		{
			goalId: 1,
			slug: "card-a",
			name: "Card A",
			remainingInCents: 50000,
			aprBasisPoints: 2990,
			minimumMonthlyInCents: 2500,
		},
		{
			goalId: 2,
			slug: "loan-b",
			name: "Loan B",
			remainingInCents: 450000,
			aprBasisPoints: 1250,
			minimumMonthlyInCents: 15000,
		},
	];

	it("calculates total debt and monthly minimums", () => {
		const result = calculateDebtStrategyMetrics(debts);
		expect(result.totalDebtInCents).toBe(500000);
		expect(result.totalMonthlyMinimumInCents).toBe(17500);
	});

	it("produces three strategy orders", () => {
		const result = calculateDebtStrategyMetrics(debts);
		expect(result.snowballOrder).toHaveLength(2);
		expect(result.avalancheOrder).toHaveLength(2);
		expect(result.hybridOrder).toHaveLength(2);
	});

	it("returns empty results for empty debt array", () => {
		const result = calculateDebtStrategyMetrics([]);
		expect(result.totalDebtInCents).toBe(0);
		expect(result.totalMonthlyMinimumInCents).toBe(0);
		expect(result.snowballOrder).toEqual([]);
	});
});
