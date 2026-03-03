import { describe, expect, it } from "vitest";
import {
	calculateContributionStats,
	calculateLiquidityBreakdown,
	calculatePaceMetrics,
} from "$lib/server/goals";

describe("calculatePaceMetrics", () => {
	it("calculates days remaining and required monthly amount", () => {
		const targetDate = new Date();
		targetDate.setMonth(targetDate.getMonth() + 6); // 6 months from now

		const result = calculatePaceMetrics({
			targetAmountInCents: 1000_00_00, // £10,000
			currentAllocationInCents: 400_00_00, // £4,000 saved
			targetDate,
		});

		expect(result.daysRemaining).toBeGreaterThan(180);
		expect(result.daysRemaining).toBeLessThan(185);
		expect(result.amountRemainingInCents).toBe(600_00_00); // £6000 remaining
		expect(result.requiredMonthlyInCents).toBeGreaterThan(95_00_00); // ~£1000/month
		expect(result.requiredMonthlyInCents).toBeLessThan(105_00_00);
	});

	it("returns null values when no target date set", () => {
		const result = calculatePaceMetrics({
			targetAmountInCents: 1000_00_00, // £10,000
			currentAllocationInCents: 400_00_00, // £4,000 saved
			targetDate: null,
		});

		expect(result.daysRemaining).toBeNull();
		expect(result.requiredMonthlyInCents).toBeNull();
	});

	it("calculates actual monthly average from allocation history", () => {
		const now = new Date();
		const threeMonthsAgo = new Date(now);
		threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

		const result = calculatePaceMetrics({
			targetAmountInCents: 1000_00_00, // £10,000 target
			currentAllocationInCents: 300_00_00, // £3,000 saved
			targetDate: null,
			firstContributionDate: threeMonthsAgo,
		});

		// £3000 over ~3 months ≈ £1000/month
		expect(result.actualMonthlyAvgInCents).toBeGreaterThan(90_00_00); // >£900
		expect(result.actualMonthlyAvgInCents).toBeLessThan(110_00_00); // <£1100
	});

	it("calculates projected completion date based on actual pace", () => {
		const now = new Date();
		const twoMonthsAgo = new Date(now);
		twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

		const result = calculatePaceMetrics({
			targetAmountInCents: 1000_00_00, // £10,000 target
			currentAllocationInCents: 200_00_00, // £2,000 saved
			targetDate: null,
			firstContributionDate: twoMonthsAgo,
		});

		// At £1000/month, £8000 remaining = 8 more months
		expect(result.projectedCompletionDate).not.toBeNull();
		if (!result.projectedCompletionDate)
			throw new Error("Expected projected date");
		const projected = result.projectedCompletionDate;
		const monthsUntilProjected = Math.round(
			(projected.getTime() - now.getTime()) / (30 * 24 * 60 * 60 * 1000),
		);
		expect(monthsUntilProjected).toBeGreaterThanOrEqual(7);
		expect(monthsUntilProjected).toBeLessThanOrEqual(9);
	});

	it("returns null projected completion when no contributions yet", () => {
		const result = calculatePaceMetrics({
			targetAmountInCents: 1000_00_00, // £10,000
			currentAllocationInCents: 0,
			targetDate: null,
			firstContributionDate: null,
		});

		expect(result.projectedCompletionDate).toBeNull();
		expect(result.actualMonthlyAvgInCents).toBe(0);
	});
});

describe("calculateLiquidityBreakdown", () => {
	it("calculates percentage breakdown by liquidity type", () => {
		const accountAllocations = [
			{ netAllocated: 50_00_00, liquidity: "instant" }, // £5000
			{ netAllocated: 30_00_00, liquidity: "delayed" }, // £3000
			{ netAllocated: 20_00_00, liquidity: "locked" }, // £2000
		];

		const result = calculateLiquidityBreakdown(accountAllocations);

		expect(result.instantPercent).toBe(50);
		expect(result.delayedPercent).toBe(30);
		expect(result.lockedPercent).toBe(20);
		expect(result.totalAllocatedInCents).toBe(100_00_00);
	});

	it("handles null liquidity as instant (default)", () => {
		const accountAllocations = [
			{ netAllocated: 50_00_00, liquidity: null },
			{ netAllocated: 50_00_00, liquidity: "instant" },
		];

		const result = calculateLiquidityBreakdown(accountAllocations);

		expect(result.instantPercent).toBe(100);
		expect(result.delayedPercent).toBe(0);
		expect(result.lockedPercent).toBe(0);
	});

	it("returns zeros for empty allocations", () => {
		const result = calculateLiquidityBreakdown([]);

		expect(result.instantPercent).toBe(0);
		expect(result.delayedPercent).toBe(0);
		expect(result.lockedPercent).toBe(0);
		expect(result.totalAllocatedInCents).toBe(0);
	});

	it("identifies liquidity warning for urgent goals", () => {
		const soonDate = new Date();
		soonDate.setDate(soonDate.getDate() + 20); // 20 days away

		const accountAllocations = [
			{ netAllocated: 100_00_00, liquidity: "locked" },
		];

		const result = calculateLiquidityBreakdown(accountAllocations, soonDate);

		expect(result.hasLiquidityWarning).toBe(true);
		expect(result.warningMessage).toContain("locked");
	});

	it("no warning when goal is not urgent", () => {
		const farDate = new Date();
		farDate.setMonth(farDate.getMonth() + 12); // 12 months away

		const accountAllocations = [
			{ netAllocated: 100_00_00, liquidity: "locked" },
		];

		const result = calculateLiquidityBreakdown(accountAllocations, farDate);

		expect(result.hasLiquidityWarning).toBe(false);
	});

	it("no warning when null target date", () => {
		const accountAllocations = [
			{ netAllocated: 100_00_00, liquidity: "locked" },
		];

		const result = calculateLiquidityBreakdown(accountAllocations, null);

		expect(result.hasLiquidityWarning).toBe(false);
	});
});

describe("calculateContributionStats", () => {
	it("calculates days since last contribution", () => {
		const twoDaysAgo = new Date();
		twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

		const allocationHistory = [
			{ amount: 10_00, createdAt: twoDaysAgo, type: "USER_ADD" },
		];

		const result = calculateContributionStats(allocationHistory);

		expect(result.daysSinceLastContribution).toBe(2);
		expect(result.totalContributions).toBe(1);
		expect(result.totalWithdrawals).toBe(0);
	});

	it("counts contributions and withdrawals separately", () => {
		const now = new Date();
		const allocationHistory = [
			{ amount: 10_00, createdAt: now, type: "USER_ADD" },
			{ amount: 5_00, createdAt: now, type: "USER_ADD" },
			{ amount: -3_00, createdAt: now, type: "USER_WITHDRAW" },
			{ amount: -2_00, createdAt: now, type: "AUTO_REDUCE_NEGATIVE_BALANCE" },
		];

		const result = calculateContributionStats(allocationHistory);

		expect(result.totalContributions).toBe(2);
		expect(result.totalWithdrawals).toBe(2); // includes auto-reduce
		expect(result.netContributedInCents).toBe(10_00); // 10+5-3-2
	});

	it("returns null days since when no history", () => {
		const result = calculateContributionStats([]);

		expect(result.daysSinceLastContribution).toBeNull();
		expect(result.totalContributions).toBe(0);
		expect(result.totalWithdrawals).toBe(0);
		expect(result.firstContributionDate).toBeNull();
		expect(result.lastContributionDate).toBeNull();
	});

	it("identifies first and last contribution dates", () => {
		const now = new Date();
		const threeDaysAgo = new Date(now);
		threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
		const fiveDaysAgo = new Date(now);
		fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

		const allocationHistory = [
			{ amount: 10_00, createdAt: threeDaysAgo, type: "USER_ADD" },
			{ amount: 10_00, createdAt: fiveDaysAgo, type: "USER_ADD" },
			{ amount: 10_00, createdAt: now, type: "USER_ADD" },
		];

		const result = calculateContributionStats(allocationHistory);

		expect(result.firstContributionDate).not.toBeNull();
		expect(result.lastContributionDate).not.toBeNull();
		// Compare just the date parts
		expect(result.firstContributionDate?.toDateString()).toBe(
			fiveDaysAgo.toDateString(),
		);
		expect(result.lastContributionDate?.toDateString()).toBe(
			now.toDateString(),
		);
	});

	it("only counts USER_ADD as contributions for last contribution tracking", () => {
		const now = new Date();
		const fiveDaysAgo = new Date(now);
		fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

		const allocationHistory = [
			{ amount: 10_00, createdAt: fiveDaysAgo, type: "USER_ADD" },
			{ amount: -5_00, createdAt: now, type: "USER_WITHDRAW" },
		];

		const result = calculateContributionStats(allocationHistory);

		// Days since should be from the ADD, not the WITHDRAW
		expect(result.daysSinceLastContribution).toBe(5);
		expect(result.totalContributions).toBe(1);
		expect(result.totalWithdrawals).toBe(1);
	});
});
