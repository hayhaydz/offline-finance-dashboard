import { describe, expect, it } from "vitest";
import { generateDefaultMilestones, checkMilestones } from "$lib/server/goals";

describe("generateDefaultMilestones", () => {
	it("generates 4 default milestones from starting balance", () => {
		const milestones = generateDefaultMilestones({
			startingBalanceInCents: -400000, // -£4,000
		});
		expect(milestones).toHaveLength(4);
		expect(milestones[0]).toEqual({
			label: "25% paid off",
			thresholdInCents: 300000, // £3,000 = 75% of starting
		});
		expect(milestones[1]).toEqual({
			label: "Halfway there",
			thresholdInCents: 200000, // £2,000 = 50%
		});
		expect(milestones[2]).toEqual({
			label: "75% paid off",
			thresholdInCents: 100000, // £1,000 = 25%
		});
		expect(milestones[3]).toEqual({
			label: "Paid off",
			thresholdInCents: 0,
		});
	});
});

describe("checkMilestones", () => {
	it("returns IDs of newly reached milestones", () => {
		const reached = checkMilestones({
			currentBalanceInCents: -180000,
			milestones: [
				{ id: 1, thresholdInCents: 300000, reachedAt: null },
				{ id: 2, thresholdInCents: 200000, reachedAt: null },
				{ id: 3, thresholdInCents: 100000, reachedAt: null },
				{ id: 4, thresholdInCents: 0, reachedAt: null },
			],
		});
		expect(reached).toEqual([1, 2]); // First two reached
	});
});
