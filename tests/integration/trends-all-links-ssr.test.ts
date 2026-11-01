import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import AllPage from "../../src/routes/overview/trends/all/+page.svelte";

// v3.2 sweep 7 (2026-11-01): the old budgets month route is merged into
// insights — every historical month link anywhere must point at
// /overview/trends/insights?month=X, never the redirecting
// /overview/trends/{month} path.

const data = {
	months: [
		{ month: "2026-10", totalTarget: 140_000, actualSpent: 960_254 },
		{ month: "2026-09", totalTarget: 308_500, actualSpent: 458_006 },
		{ month: "2026-08", totalTarget: 250_000, actualSpent: 210_000 },
	],
	pagination: { page: 1, totalPages: 1 },
	amendmentTimeline: [
		{
			id: 1,
			month: "2026-10",
			field: "totalTargetInCents",
			oldValue: "150000",
			newValue: "140000",
			reason: "corrected",
			createdAt: new Date("2026-10-05T12:00:00Z"),
		},
	] as never,
	years: [
		{
			year: 2026,
			months: [
				{ month: "2026-10", totalTarget: 140_000, actualSpent: 960_254 },
				{ month: "2026-09", totalTarget: 308_500, actualSpent: 458_006 },
			],
		},
	],
};

describe("Trends /all — merged-surface links (v3.2 sweep 7)", () => {
	it("history table month links target insights?month=, not the old month route", () => {
		const { body } = render(AllPage, { props: { data } });
		expect(body).toContain('href="/overview/trends/insights?month=2026-10"');
		expect(body).toContain('href="/overview/trends/insights?month=2026-09"');
	});

	it("no link points at the redirecting /overview/trends/{month} path", () => {
		const { body } = render(AllPage, { props: { data } });
		expect(body).not.toMatch(/href="\/overview\/trends\/\d{4}-\d{2}"/);
	});
});
