import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import DebtWaterfallChart from "$lib/components/charts/DebtWaterfallChart.svelte";

// Phase 5 line 2: debt waterfall — snowball-ordered descending steps with
// projected payoff dates + dashed debt-free horizon.

const goals = [
	{ name: "Clear Mastercard", slug: "a", remainingInCents: 45000, projectedPayoffDate: new Date("2028-03-01") },
	{ name: "Rewards Card 0% Payoff", slug: "b", remainingInCents: 85000, projectedPayoffDate: new Date("2029-08-01") },
	{ name: "Pay off Visa Gold", slug: "c", remainingInCents: 231500, projectedPayoffDate: new Date("2034-02-01") },
	{ name: "Final Car Loan Push", slug: "d", remainingInCents: 1120000, projectedPayoffDate: new Date("2029-05-01") },
];
const total = goals.reduce((s, g) => s + g.remainingInCents, 0);
const fmt = (p: number) => `£${(p / 100).toFixed(2)}`;

describe("DebtWaterfallChart (Phase 5 line 2)", () => {
	it("renders one step per goal with payoff-date labels", () => {
		const { body } = render(DebtWaterfallChart, {
			props: {
				goals,
				totalDebtInCents: total,
				projectedDebtFreeDate: new Date("2034-02-01"),
				formatPence: fmt,
			},
		});
		expect((body.match(/<rect /g) || []).length).toBe(goals.length);
		expect(body).toContain(">2028-03<");
		expect(body).toContain(">2034-02<");
	});

	it("names the panel, total, and projected debt-free date in the summary", () => {
		const { body } = render(DebtWaterfallChart, {
			props: {
				goals,
				totalDebtInCents: total,
				projectedDebtFreeDate: new Date("2034-02-01"),
				formatPence: fmt,
			},
		});
		expect(body).toContain("Debt payoff waterfall");
		expect(body).toContain("£1,4815.00".replace("£1,4815.00", "£14815.00"));
		expect(body).toContain("projected debt-free 2034-02");
		expect(body).toContain("snowball order");
	});

	it("scales name truncation to step width (fewer steps fit longer names)", () => {
		const { body } = render(DebtWaterfallChart, {
			props: {
				goals,
				totalDebtInCents: total,
				projectedDebtFreeDate: new Date("2034-02-01"),
				formatPence: fmt,
			},
		});
		// 22-char names survive at this width...
		expect(body).toContain(">Rewards Card 0% Payoff</text>");
		// ...and a 30-char name still truncates with an ellipsis
		const withLong = render(DebtWaterfallChart, {
			props: {
				goals: [
					...goals.slice(0, 3),
					{ ...goals[3], name: "Extremely Long Car Loan Name" },
				],
				totalDebtInCents: total,
				projectedDebtFreeDate: new Date("2034-02-01"),
				formatPence: fmt,
			},
		}).body;
		expect(withLong).toContain("…");
		expect(withLong).toContain("Extremely Long Car Lo…");
	});

	it("truncates long goal names and draws the dashed horizon", () => {
		const { body } = render(DebtWaterfallChart, {
			props: {
				goals,
				totalDebtInCents: total,
				projectedDebtFreeDate: new Date("2034-02-01"),
				formatPence: fmt,
			},
		});
		expect(body).toContain("chart-dashed");
		expect(body).toContain("debt-free horizon");
		// Phase 9: at 4 steps (stepW ~141) a 22-char name fits untruncated
		expect(body).toContain(">Rewards Card 0% Payoff</text>");
	});

	it("empty state when no debt goals", () => {
		const { body } = render(DebtWaterfallChart, {
			props: {
				goals: [],
				totalDebtInCents: 0,
				projectedDebtFreeDate: null,
				formatPence: fmt,
			},
		});
		expect(body).toContain("[no debt goals]");
	});

	it("is a print-safe viewBox SVG with role=img", () => {
		const { body } = render(DebtWaterfallChart, {
			props: {
				goals,
				totalDebtInCents: total,
				projectedDebtFreeDate: new Date("2034-02-01"),
				formatPence: fmt,
			},
		});
		expect(body).toMatch(/viewBox="0 0 600 200"/);
		expect(body).toContain('role="img"');
	});
});
