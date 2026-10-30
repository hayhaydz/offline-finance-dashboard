// tests/integration/bills-page-emerging-ssr.test.ts
//
// v3 R-H15: the bills page renders an EMERGING watchlist (exactly-two
// occurrence candidates) and keeps its honest empty states. The live dev
// dataset has no qualifying pairs, so the render path is pinned here with
// fixture load data (the detector logic itself is unit-tested).

import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import BillsPage from "../../src/routes/overview/bills/+page.svelte";

const base = (over: Record<string, unknown> = {}) => ({
	props: {
		data: {
			patterns: [],
			emerging: [],
			monthlyTotalPence: 0,
			yearlyTotalPence: 0,
			...over,
		},
	},
});

describe("bills page (R25 + R-H15)", () => {
	it("classic empty state when nothing detected at all", () => {
		const { body } = render(BillsPage, base());
		expect(body).toContain("No recurring payment patterns detected yet");
		expect(body).not.toContain("EMERGING");
	});

	it("emerging-only data renders the watchlist without the confirmed table", () => {
		const { body } = render(
			BillsPage,
			base({
				emerging: [
					{
						description: "Spotify",
						amountPence: 999,
						firstDate: "2026-09-05",
						lastDate: "2026-10-05",
					},
				],
			}),
		);
		expect(body).toContain("EMERGING — 2 occurrences, one more confirms (1)");
		expect(body).toContain("Spotify");
		expect(body).toContain("watching");
		expect(body).toContain("~£9.99");
		expect(body).toContain("2026-09-05 → 2026-10-05");
		// no confirmed bills → no confirmed table header
		expect(body).not.toContain("Next (60d)");
	});

	it("confirmed bills and emerging candidates coexist", () => {
		const { body } = render(
			BillsPage,
			base({
				patterns: [
					{
						description: "Rent Ltd",
						amountPence: 95000,
						lastDate: "2026-10-01",
						nextDate: "2026-11-01",
					},
				],
				monthlyTotalPence: 95000,
				yearlyTotalPence: 1140000,
				emerging: [
					{
						description: "Gym Pass",
						amountPence: 2500,
						firstDate: "2026-09-10",
						lastDate: "2026-10-10",
					},
				],
			}),
		);
		expect(body).toContain("Rent Ltd");
		expect(body).toContain("EMERGING");
		expect(body).toContain("Gym Pass");
	});
});
