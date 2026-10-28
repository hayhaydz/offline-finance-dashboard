import { describe, expect, it } from "vitest";
import { computeGoalProgress } from "$lib/server/goals";

// P1-5 regression (2026-10-27 audit): snapshot + routine views rendered
// debt goals as "£0 / £0 · 0%" because they derived progress from
// allocation fields debt goals never populate. One shared function now
// covers both goal types for every view.

describe("computeGoalProgress (P1-5)", () => {
	it("computes savings progress from allocation ÷ target", () => {
		const r = computeGoalProgress({
			goalType: "savings",
			targetAmountInCents: 1_200_000,
			currentAllocation: 480_000,
		});
		expect(r.progressView.percent).toBe(40);
		expect(r.progressView.progressAmountInCents).toBe(480_000);
		expect(r.progressView.progressTargetInCents).toBe(1_200_000);
		expect(r.progressView.debtGrewBeyondStarting).toBe(false);
	});

	it("caps savings progress at 100% when over target", () => {
		const r = computeGoalProgress({
			goalType: "savings",
			targetAmountInCents: 100_000,
			currentAllocation: 250_000,
		});
		expect(r.progressView.percent).toBe(100);
	});

	it("computes debt progress from starting vs current balance", () => {
		// Visa Gold state: started -£2,500, now -£2,315 → 7% paid
		const r = computeGoalProgress(
			{
				goalType: "debt",
				linkedAccountId: 9,
				startingBalanceInCents: -250_000,
				targetAmountInCents: 0,
				currentAllocation: 0,
			},
			new Map([[9, -231_500]]),
		);
		expect(r.progressView.percent).toBe(7);
		expect(r.progressView.progressAmountInCents).toBe(18_500);
		expect(r.progressView.progressTargetInCents).toBe(250_000);
		expect(r.progressView.debtCurrentBalanceInCents).toBe(-231_500);
	});

	it("flags debt grown beyond starting", () => {
		const r = computeGoalProgress(
			{
				goalType: "debt",
				linkedAccountId: 3,
				startingBalanceInCents: -150_000,
				targetAmountInCents: 0,
				currentAllocation: 0,
			},
			new Map([[3, -1_120_000]]),
		);
		expect(r.progressView.debtGrewBeyondStarting).toBe(true);
		expect(r.progressView.percent).toBe(0);
	});

	it("debt with no linked account reads as £0 balance (100% paid)", () => {
		const r = computeGoalProgress({
			goalType: "debt",
			linkedAccountId: null,
			startingBalanceInCents: -50_000,
			targetAmountInCents: 0,
			currentAllocation: 0,
		});
		expect(r.progressView.percent).toBe(100);
	});

	it("zero-target savings reads 0%, not NaN", () => {
		const r = computeGoalProgress({
			goalType: "savings",
			targetAmountInCents: 0,
			currentAllocation: 0,
		});
		expect(r.progressView.percent).toBe(0);
	});

	it("treats missing goalType as savings (legacy rows)", () => {
		const r = computeGoalProgress({
			targetAmountInCents: 100_000,
			currentAllocation: 50_000,
		});
		expect(r.progressView.percent).toBe(50);
	});
});
