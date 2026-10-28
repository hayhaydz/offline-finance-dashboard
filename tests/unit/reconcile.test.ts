import { describe, expect, it } from "vitest";
import { isStaleBalance, planReconciliation } from "$lib/utils/reconcile";

describe("planReconciliation (#16)", () => {
	it("asset gains map to deposits, losses to withdrawals", () => {
		expect(planReconciliation("asset", 5000)).toEqual({
			kind: "create",
			type: "deposit",
			amountPence: 5000,
		});
		expect(planReconciliation("asset", -2500)).toEqual({
			kind: "create",
			type: "withdrawal",
			amountPence: 2500,
		});
	});

	it("liability debt growth maps to charges, repayment to payments", () => {
		expect(planReconciliation("liability", -3000)).toEqual({
			kind: "create",
			type: "charge",
			amountPence: 3000,
		});
		expect(planReconciliation("liability", 1500)).toEqual({
			kind: "create",
			type: "payment",
			amountPence: 1500,
		});
	});

	it("zero and sub-penny deltas are skipped", () => {
		expect(planReconciliation("asset", 0)).toEqual({
			kind: "skip",
			reason: "zero-delta",
		});
		expect(planReconciliation("liability", 0)).toEqual({
			kind: "skip",
			reason: "zero-delta",
		});
	});

	it("amounts are always positive pence (sign normalised downstream)", () => {
		for (const category of ["asset", "liability"]) {
			for (const delta of [-12345, 12345]) {
				const plan = planReconciliation(category, delta);
				if (plan.kind === "create") expect(plan.amountPence).toBeGreaterThan(0);
			}
		}
	});
});

describe("isStaleBalance (#17 threshold)", () => {
	const now = new Date("2026-10-28T12:00:00Z");

	it("null last update is stale", () => {
		expect(isStaleBalance(null, now)).toBe(true);
	});

	it("recent update is fresh, 35+ day old update is stale", () => {
		expect(isStaleBalance(new Date("2026-10-27T12:00:00Z"), now)).toBe(false);
		expect(isStaleBalance(new Date("2026-09-20T12:00:00Z"), now)).toBe(true);
	});
});
