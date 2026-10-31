import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import RoutinePage from "../../src/routes/overview/routine/+page.svelte";

// v3.1 A06: the routine page's STREAK banner duplicated the summary
// strip's first two cells (banned-pattern #4 inverse — the wall survived
// its strip). The banner is gone; the strip is 5 cells with the banner's
// only unique datum (Last active) rescued into a cell.

const data = {
	streak: { currentStreak: 5, longestStreak: 5, lastActiveMonth: "2026-03" },
	thisMonth: "2026-04",
	history: [
		{ yearMonth: "2026-03", label: "Mar 2026", completedCount: 6, totalItems: 6, isComplete: true, notes: null },
		{ yearMonth: "2026-02", label: "Feb 2026", completedCount: 4, totalItems: 6, isComplete: false, notes: "skipped goals" },
	],
} as never;

describe("Routine summary strip (v3.1 A06)", () => {
	it("renders five cells including the rescued Last active datum", () => {
		const { body } = render(RoutinePage, { props: { data } });
		expect(body).toContain("Current streak");
		expect(body).toContain("Longest");
		expect(body).toContain("This month");
		expect(body).toContain("Last active");
		expect(body).toContain("Mar 2026");
		expect(body).toContain("Action");
	});

	it("the duplicated STREAK banner is gone", () => {
		const { body } = render(RoutinePage, { props: { data } });
		expect(body).not.toContain("STREAK:");
	});

	it("history table still renders with status semantics", () => {
		const { body } = render(RoutinePage, { props: { data } });
		expect(body).toContain("6/6");
		expect(body).toContain("DONE");
		expect(body).toContain("skipped goals");
	});
});
