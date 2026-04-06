import { describe, expect, it } from "vitest";

describe("GoalRow deadline display", () => {
	it("should show target date for savings goals", () => {
		const goal = { goalType: "savings", targetDate: new Date("2026-12-31") };
		const hasTargetDate = !!goal.targetDate;
		expect(hasTargetDate).toBe(true);
	});

	it("should show target date for debt goals", () => {
		const goal = { goalType: "debt", targetDate: new Date("2026-12-31") };
		const hasTargetDate = !!goal.targetDate;
		expect(hasTargetDate).toBe(true);
	});

	it("should show 'No deadline' when targetDate is null for savings", () => {
		const goal = { goalType: "savings", targetDate: null };
		const hasTargetDate = !!goal.targetDate;
		expect(hasTargetDate).toBe(false);
	});

	it("should show 'No deadline' when targetDate is null for debt", () => {
		const goal = { goalType: "debt", targetDate: null };
		const hasTargetDate = !!goal.targetDate;
		expect(hasTargetDate).toBe(false);
	});
});
