import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import RateHeatmap from "$lib/components/charts/RateHeatmap.svelte";
import AllocationBar from "$lib/components/charts/AllocationBar.svelte";
import CashflowCalendar from "$lib/components/charts/CashflowCalendar.svelte";

// Phase 7 line 2: surface-intelligence components.

describe("RateHeatmap", () => {
	const rows = [
		{
			name: "Monzo Instant",
			rates: [
				{ rate: 410, effectiveFrom: new Date("2025-06-01") },
				{ rate: 455, effectiveFrom: new Date("2026-06-15") },
			],
		},
	];
	const months = [
		new Date("2026-05-01"),
		new Date("2026-06-01"),
		new Date("2026-07-01"),
	];

	it("renders one row per account with rate cells + numeric legend", () => {
		const { body } = render(RateHeatmap, { props: { rows, months } });
		expect(body).toContain("Rate heatmap");
		expect(body).toContain("Monzo Instant");
		expect(body).toContain("4.10");
		expect(body).toContain("4.55");
		// numeric legend endpoints (second-mandate redesign)
		expect(body).toContain("4.10%");
		expect(body).toContain("4.55%");
		// interactive cells are buttons with full aria labels
		expect(body).toContain('aria-label="Monzo Instant May: 4.10%"');
	});

	it("summary states the range; the hover hint lives in the panel", () => {
		const { body } = render(RateHeatmap, { props: { rows, months } });
		expect(body).toContain("1 accounts × 3 months");
		expect(body).toContain("4.10%–4.55%");
		expect(body).toContain("hover a cell for account · month · rate · change");
	});

	it("row header carries the current rate and rise marker", () => {
		const { body } = render(RateHeatmap, { props: { rows, months } });
		// 4.10 → 4.55 across the window = changed (green current chip)
		expect(body.match(/text-green-700 font-bold">4\.55%/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
	});

	it("empty state when no rate history", () => {
		const { body } = render(RateHeatmap, {
			props: { rows: [{ name: "X", rates: [] }], months },
		});
		expect(body).toContain("[no rate history]");
	});
});

describe("AllocationBar", () => {
	// A13 migration: the chart is client-mounted ({:if browser}); SSR
	// pins the frame + summary contract (the a11y text path).
	it("renders frame + summary contract server-side", () => {
		const { body } = render(AllocationBar, {
			props: {
				items: [
					{ name: "Emergency fund", value: 400_000 },
					{ name: "House deposit", value: 200_000 },
					{ name: "Visa payoff", value: 200_000 },
				],
			},
		});
		expect(body).toContain("Allocation");
		expect(body).toContain("£8,000.00");
		expect(body).toContain("largest: Emergency fund (50%)");
		expect(body).not.toContain("data-interactive-chart"); // client-only mount
	});

	it("empty state when nothing allocated", () => {
		const { body } = render(AllocationBar, { props: { items: [] } });
		expect(body).toContain("[no allocated money]");
	});
});

describe("CashflowCalendar", () => {
	const obligations = [
		{ date: "2026-10-05", description: "Rent", amountPence: -95_000 },
		{ date: "2026-10-05", description: "Gym", amountPence: -2_500 },
		{ date: "2026-10-21", description: "Phone", amountPence: -3_500 },
	];

	it("renders the month grid with weekday header and due badges", () => {
		const { body } = render(CashflowCalendar, {
			props: { year: 2026, month: 10, obligations },
		});
		expect(body).toContain("Cashflow calendar — October 2026");
		expect(body).toContain("Mo");
		expect(body).toContain("Rent");
		expect(body).toContain("Gym");
		expect(body).toContain("Phone");
	});

	it("summary counts dues and the total", () => {
		const { body } = render(CashflowCalendar, {
			props: { year: 2026, month: 10, obligations },
		});
		expect(body).toContain("3 projected dues in October 2026");
		expect(body).toContain("£1,010.00 total");
	});

	it("no-dues summary when the month is quiet", () => {
		const { body } = render(CashflowCalendar, {
			props: { year: 2026, month: 10, obligations: [] },
		});
		expect(body).toContain("No recurring obligations detected");
	});
});
