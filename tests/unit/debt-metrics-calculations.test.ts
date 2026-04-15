import { describe, expect, it } from "vitest";
import {
	calculatePayoffProjection,
	getDefaultMonthlyPayment,
	calculateRecentAveragePayment,
	getCurrentApr,
} from "$lib/server/debtMetrics";

describe("Debt metrics calculations", () => {
	describe("calculatePayoffProjection", () => {
		it("should calculate months to payoff with zero interest", () => {
			const result = calculatePayoffProjection({
				balanceInCents: 100000, // £1,000
				aprBasisPoints: 0,
				monthlyPaymentInCents: 20000, // £200
			});
			expect(result.months).toBe(5);
		});

		it("should calculate months to payoff with interest", () => {
			const result = calculatePayoffProjection({
				balanceInCents: 320000, // £3,200
				aprBasisPoints: 249, // 2.49% (basis points)
				monthlyPaymentInCents: 20000, // £200
			});
			expect(result.months).toBeGreaterThan(0);
			expect(result.projectedPayoffDate).toBeInstanceOf(Date);
		});

		it("should handle zero balance", () => {
			const result = calculatePayoffProjection({
				balanceInCents: 0,
				aprBasisPoints: 249,
				monthlyPaymentInCents: 20000,
			});
			expect(result.months).toBe(0);
		});

		it("should return nulls when payment is too small to cover interest", () => {
			const result = calculatePayoffProjection({
				balanceInCents: 320000,
				aprBasisPoints: 249,
				monthlyPaymentInCents: 100, // Too small
			});
			expect(result.months).toBeNull();
			expect(result.totalInterestInCents).toBeNull();
			expect(result.projectedPayoffDate).toBeNull();
		});

		it("should return nulls when monthly payment is zero", () => {
			const result = calculatePayoffProjection({
				balanceInCents: 100000,
				aprBasisPoints: 249,
				monthlyPaymentInCents: 0,
			});
			expect(result.months).toBeNull();
		});

		it("should treat null APR as 0% interest", () => {
			const result = calculatePayoffProjection({
				balanceInCents: 120000,
				aprBasisPoints: null,
				monthlyPaymentInCents: 10000,
			});
			expect(result.months).toBe(12);
			expect(result.totalInterestInCents).toBe(0);
		});
	});

	describe("getDefaultMonthlyPayment", () => {
		it("should return 2x minimum payment when available", () => {
			const minimumPayment = 5000; // £50
			const result = getDefaultMonthlyPayment(minimumPayment, null);
			expect(result).toBe(10000);
		});

		it("should return recent average when minimum payment is zero", () => {
			const minimumPayment = 0;
			const recentAverage = 15000;
			const result = getDefaultMonthlyPayment(minimumPayment, recentAverage);
			expect(result).toBe(recentAverage);
		});

		it("should return recent average when minimum payment is null", () => {
			const minimumPayment = null;
			const recentAverage = 15000;
			const result = getDefaultMonthlyPayment(minimumPayment, recentAverage);
			expect(result).toBe(recentAverage);
		});

		it("should return fallback when both are null/zero", () => {
			const result = getDefaultMonthlyPayment(null, null);
			expect(result).toBe(10000); // £100 default
		});
	});

	describe("calculateRecentAveragePayment", () => {
		it("should calculate average of recent payments", () => {
			const transactions = [
				{ amount: -20000, createdAt: new Date() },
				{ amount: -30000, createdAt: new Date() },
			];
			const result = calculateRecentAveragePayment(transactions);
			expect(result).toBe(25000);
		});

		it("should return null when no recent payments", () => {
			const transactions = [
				{ amount: 10000, createdAt: new Date() }, // positive = not a payment
			];
			const result = calculateRecentAveragePayment(transactions);
			expect(result).toBeNull();
		});
	});

	describe("getCurrentApr", () => {
		it("should return the most recent rate", () => {
			const rates = [
				{ rate: 150, effectiveFrom: new Date("2025-01-01") },
				{ rate: 249, effectiveFrom: new Date("2026-01-01") },
			];
			const result = getCurrentApr(rates);
			expect(result).toBe(249);
		});

		it("should return null for empty array", () => {
			const result = getCurrentApr([]);
			expect(result).toBeNull();
		});
	});
});
