import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";

// client-only kit runtime — stubbed for SSR rendering of the route component
vi.mock("$app/navigation", () => ({ goto: vi.fn().mockResolvedValue(undefined) }));
vi.mock("$app/state", () => ({
	page: { url: new URL("http://test.local/accounts") },
}));

import AccountsPage from "../../src/routes/accounts/+page.svelte";

// v3.1 A03: the /accounts facts strip — 6 cells (ACCOUNTS / ASSETS /
// LIABILITIES / MATURING ≤90D / ALERTS with severity chips / CLOSED)
// replacing the v3 SUMMARY|ALERTS 3/2 grid whose SUMMARY cell measured
// 40% content-fill (doctrine D2 defect; 422px band → ~58px strip).

const account = (over: Record<string, unknown>) => ({
	id: 1,
	slug: "acc",
	name: "Test Account",
	type: "current",
	institution: "NatWest",
	category: "asset",
	currentBalance: 100_00,
	currentRate: 125,
	monthlyInterest: 104,
	yearlyInterest: 1250,
	daysToMaturity: null,
	maturityDate: null,
	lastUpdated: new Date("2026-10-31T00:00:00Z"),
	closedAt: null,
	excludedFromNetWorth: false,
	...over,
});

const data = {
	environment: { mode: "development", isProduction: false, hasEncryption: true },
	user: { id: 1, username: "admin", createdAt: new Date("2026-01-01"), inactivityTimeout: 240 },
	accounts: [
		account({ id: 1, name: "NatWest Current", slug: "current" }),
		account({ id: 2, name: "ISA Saver", slug: "isa", type: "savings", currentRate: 500 }),
		account({
			id: 3,
			name: "Old Card",
			slug: "old-card",
			type: "credit-card",
			category: "liability",
			currentBalance: -450_00,
			closedAt: new Date("2026-01-01T00:00:00Z"),
		}),
		account({ id: 4, name: "Bond", slug: "bond", type: "savings", daysToMaturity: 45, maturityDate: new Date("2026-12-15T00:00:00Z") }),
	],
	netWorthSummary: {
		netWorth: -250_00,
		totalAssets: 200_00,
		totalLiabilities: -450_00,
		exclusionCount: 0,
		excludedAssets: 0,
		excludedLiabilities: 0,
		hasStaleData: false,
		dateRange: { oldest: new Date("2026-01-01T00:00:00Z"), newest: new Date("2026-10-31T00:00:00Z") },
	},
	alerts: [
		{ id: 1, severity: "red", title: "Payment below interest", accountName: "Visa Gold" },
		{ id: 2, severity: "red", title: "No minimum payment", accountName: "Rewards Card" },
		{ id: 3, severity: "amber", title: "Rate ending soon", accountName: "Bond" },
	],
	institutions: ["NatWest"],
	institutionCounts: { NatWest: 1 },
	accountsPagination: { page: 1, totalPages: 1 },
	rateHeatmap: null,
} as never;

describe("Accounts facts strip (v3.1 A03, D2)", () => {
	it("renders the six facts cells with counts", () => {
		const { body } = render(AccountsPage, { props: { data } });
		expect(body).toContain("Accounts");
		expect(body).toContain(">3</"); // 3 open accounts
		expect(body).toContain("Assets");
		expect(body).toContain("Liabilities");
		expect(body).toContain("Maturing ≤90d");
		expect(body).toContain(">1</"); // one account maturing within 90d
		expect(body).toContain("Closed");
	});

	it("alert cell carries severity chips and a triage link", () => {
		const { body } = render(AccountsPage, { props: { data } });
		expect(body).toContain("[!!2]");
		expect(body).toContain("[!1]");
		expect(body).toContain('href="/alerts"');
		expect(body).toContain("Triage");
	});

	it("the old SUMMARY band and inline ACCOUNT ALERTS wall are gone", () => {
		const { body } = render(AccountsPage, { props: { data } });
		expect(body).not.toContain("Total Accounts");
		expect(body).not.toContain("ACCOUNT ALERTS");
	});

	it("liabilities cell links the liabilities surface", () => {
		const { body } = render(AccountsPage, { props: { data } });
		expect(body).toContain('href="/accounts/liabilities"');
	});
});
