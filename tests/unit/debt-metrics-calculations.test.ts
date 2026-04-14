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
			const balance = 100000; // £1,000
			const apr = 0;
			const monthlyPayment = 20000; // £200
			const result = calculatePayoffProjection(balance, apr, monthlyPayment);
			expect(result.months).toBe(5);
		});

		it("should calculate months to payoff with interest", () => {
			const balance = 320000; // £3,200
			const apr = 249; // 2.49% (basis points)
			const monthlyPayment = 20000; // £200
			const result = calculatePayoffProjection(balance, apr, monthlyPayment);
			expect(result.months).toBeGreaterThan(0);
			expect(result.projectedPayoffDate).toBeInstanceOf(Date);
		});

		it("should handle zero balance", () => {
			const balance = 0;
			const apr = 249;
			const monthlyPayment = 20000;
			const result = calculatePayoffProjection(balance, apr, monthlyPayment);
			expect(result.months).toBe(0);
		});

		it("should throw when payment is too small to cover interest", () => {
			const balance = 320000;
			const apr = 249;
			const monthlyPayment = 100; // Too small
			expect(() => {
				calculatePayoffProjection(balance, apr, monthlyPayment);
			}).toThrow();
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
