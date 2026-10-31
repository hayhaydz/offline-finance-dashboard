import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import LiabilitiesPage from "../../src/routes/accounts/liabilities/+page.svelte";

// v3.1 A03 (D1/D3): liabilities as a terminal table — the v3 page read as
// 7 stacked full-width cards (1582×95 each) at desktop width. The data is
// 6 table-shaped fields per liability; rows now carry TTZ states inline
// (green pays-off, amber no-rule link, red payment-below-interest).

const liability = (over: Record<string, unknown>) => ({
	id: 1,
	slug: "visa-gold",
	name: "Visa Gold",
	type: "credit-card",
	balance: -2315_00,
	utilization: "15.4",
	progress: null,
	months: null,
	years: null,
	projection: [{ interest: 4630 }],
	projectionNullReason: null,
	...over,
});

const data = {
	revolving: [
		liability({ id: 1, name: "Visa Gold", projectionNullReason: "payment_below_interest" }),
		liability({
			id: 2,
			slug: "mastercard",
			name: "Mastercard",
			balance: -1847_10,
			utilization: "12.3",
			months: 38,
			years: 3.17,
			projection: [{ interest: 0 }],
		}),
		liability({
			id: 3,
			slug: "rewards",
			name: "Rewards Card",
			balance: -680_22,
			utilization: null,
			months: null,
			years: null,
			projection: [],
			projectionNullReason: "no_minimum_payment",
		}),
	],
	installment: [
		liability({
			id: 4,
			slug: "mortgage",
			name: "Home Mortgage",
			type: "mortgage",
			balance: -246451_00,
			utilization: null,
			progress: "1.4",
			months: 271,
			years: 22.6,
			projection: [{ interest: 141162 }],
		}),
		liability({
			id: 5,
			slug: "car-loan",
			name: "Car Loan",
			type: "loan",
			balance: 0,
			utilization: null,
			progress: "100.0",
			months: 0,
			years: 0,
			projection: [{ interest: 0 }],
		}),
	],
	summary: { totalDebt: -251293_32, totalMonthlyInterest: 145792, count: 5 },
} as never;

describe("Liabilities terminal table (v3.1 A03)", () => {
	it("renders the summary strip with totals and section counts", () => {
		const { body } = render(LiabilitiesPage, { props: { data } });
		expect(body).toContain("Total debt");
		expect(body).toContain("Monthly interest");
		expect(body).toContain("Revolving");
		expect(body).toContain("Installment");
		expect(body).toContain("Critical");
	});

	it("renders revolving + installment tables with typed header columns", () => {
		const { body } = render(LiabilitiesPage, { props: { data } });
		expect(body).toContain("Revolving debt (3)");
		expect(body).toContain("Installment debt (2)");
		expect(body).toContain(">Util<");
		expect(body).toContain(">Progress<");
		expect(body).toContain("Monthly int");
		expect(body).toContain(">TTZ<");
	});

	it("rows carry the TTZ state machine: red critical, plain healthy, amber no-rule link, green pays-off", () => {
		const { body } = render(LiabilitiesPage, { props: { data } });
		expect(body).toContain("payment &lt; interest");
		expect(body).toContain("3y 2m");
		expect(body).toContain('href="/accounts/rewards/edit"');
		expect(body).toContain("Set rule");
		expect(body).toContain("pays off this month");
	});

	it("account names are bracket-links to the detail pages", () => {
		const { body } = render(LiabilitiesPage, { props: { data } });
		expect(body).toContain('href="/accounts/visa-gold"');
		expect(body).toContain('href="/accounts/mortgage"');
	});

	it("the card stack is gone — no per-card View details links", () => {
		const { body } = render(LiabilitiesPage, { props: { data } });
		expect(body).not.toContain("View details");
	});
});
