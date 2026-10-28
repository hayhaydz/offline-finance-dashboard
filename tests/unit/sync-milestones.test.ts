import { describe, expect, it } from "vitest";
import { syncMilestones } from "$lib/server/goal-calculations";

// P1-4 regression (2026-10-27 audit): debt goal at 7% paid showed
// "[✓] Halfway there" and "[✓] 25% paid off". Milestones were one-way:
// reachedAt was only ever SET, never cleared — seed fiction or regrown
// debt kept wrong ticks forever. syncMilestones is two-way.

const ms = (id: number, thresholdInCents: number, reachedAt: Date | null) => ({
	id,
	thresholdInCents,
	reachedAt,
});

describe("syncMilestones (P1-4)", () => {
	it("un-reaches milestones when balance rose back above threshold", () => {
		// Visa Gold audit state: balance -£2,315 (7% paid), yet 25%/Halfway ticked
		const res = syncMilestones({
			currentBalanceInCents: -231500,
			milestones: [
				ms(1, 187500, new Date("2026-10-26")), // wrongly reached
				ms(2, 125000, new Date("2026-10-26")), // wrongly reached
				ms(3, 62500, null),
				ms(4, 0, null),
			],
		});
		expect(res.noLongerReachedIds).toEqual([1, 2]);
		expect(res.newlyReachedIds).toEqual([]);
	});

	it("reaches milestones the balance has fallen below", () => {
		const res = syncMilestones({
			currentBalanceInCents: -50000, // £50 left of £200 starting
			milestones: [ms(1, 150000, null), ms(2, 100000, null), ms(3, 0, null)],
		});
		expect(res.newlyReachedIds).toEqual([1, 2]);
		expect(res.noLongerReachedIds).toEqual([]);
	});

	it("keeps correct reached state untouched (no spurious writes)", () => {
		const res = syncMilestones({
			currentBalanceInCents: -45000, // 43.75% paid of £800
			milestones: [
				ms(1, 60000, new Date("2026-01-15")), // 25% reached — correct
				ms(2, 40000, null), // halfway not reached — correct
			],
		});
		expect(res.newlyReachedIds).toEqual([]);
		expect(res.noLongerReachedIds).toEqual([]);
	});

	it("treats zero balance as fully paid (all thresholds reached)", () => {
		const res = syncMilestones({
			currentBalanceInCents: 0,
			milestones: [ms(1, 100000, null), ms(2, 0, null)],
		});
		expect(res.newlyReachedIds).toEqual([1, 2]);
	});

	it("handles debt grown beyond starting (nothing reaches)", () => {
		const res = syncMilestones({
			currentBalanceInCents: -1120000, // grew past -£1,500 starting
			milestones: [
				ms(1, 112500, new Date()), // stale tick from seed fiction
				ms(2, 0, null),
			],
		});
		expect(res.noLongerReachedIds).toEqual([1]);
		expect(res.newlyReachedIds).toEqual([]);
	});
});
