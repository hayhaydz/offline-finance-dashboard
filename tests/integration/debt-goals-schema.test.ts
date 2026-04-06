import { describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { goals, goalMilestones } from "$lib/db/schema";

describe("debt goals schema", () => {
	it("stores goalType discriminator on goals table", async () => {
		const result = await db
			.select({
				goalType: goals.goalType,
				linkedAccountId: goals.linkedAccountId,
				startingBalanceInCents: goals.startingBalanceInCents,
			})
			.from(goals)
			.limit(1);

		expect(Array.isArray(result)).toBe(true);
	});

	it("creates goalMilestones table with correct structure", async () => {
		const result = await db
			.select({
				id: goalMilestones.id,
				goalId: goalMilestones.goalId,
				label: goalMilestones.label,
				thresholdInCents: goalMilestones.thresholdInCents,
				reachedAt: goalMilestones.reachedAt,
			})
			.from(goalMilestones)
			.limit(1);

		expect(Array.isArray(result)).toBe(true);
	});
});
