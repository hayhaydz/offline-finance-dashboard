import { describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";
import HomePage from "../../src/routes/+page.svelte";

// v3.1 A12 flagship metric: the home GOALS preview caps at 3 cards with a
// "+N more goals — view all" footer — the 10-card list stretched the
// neighbouring ACCOUNTS cell to 27% content-fill (D2 pairing violation).

vi.mock("$app/navigation", () => ({ goto: vi.fn().mockResolvedValue(undefined) }));
vi.mock("$app/state", () => ({
	page: { url: new URL("http://test.local/") },
}));

const goal = (i: number) => ({
	id: i,
	slug: `goal-${i}`,
	name: `Goal ${i}`,
	goalType: "savings",
	targetAmountInCents: 100_000,
	currentAllocation: 50_000,
	updatedAt: new Date("2026-10-01T00:00:00Z"),
	progress: null,
	isEmergencyFund: false,
	projectedPayoffDate: null,
});

const data = {
	environment: { mode: "development", isProduction: false, hasEncryption: true },
	user: { id: 1, username: "admin", createdAt: new Date("2026-01-01"), inactivityTimeout: 240 },
	netWorthSummary: {
		netWorth: -100_00,
		totalAssets: 200_00,
		totalLiabilities: -300_00,
		exclusionCount: 0,
		excludedAssets: 0,
		excludedLiabilities: 0,
		hasStaleData: false,
		dateRange: { oldest: new Date("2026-01-01"), newest: new Date("2026-10-01") },
	},
	accounts: [],
	goals: Array.from({ length: 9 }, (_, i) => goal(i + 1)),
	goalsPagination: { page: 1, totalPages: 1 },
	netWorthTrend: [],
	alerts: [],
	staleness: null,
	isaTracker: {
		used: 4_000_00,
		limit: 20_000_00,
		remaining: 16_000_00,
		taxYearStart: new Date("2026-04-06T00:00:00Z"),
		taxYearEnd: new Date("2027-04-05T00:00:00Z"),
		pacing: null,
	},
	interestSummary: null,
	isaSummary: null,
	cashflow: null,
} as never;

describe("Home goals preview cap (v3.1 A12, D2)", () => {
	it("renders at most three goal cards", () => {
		const { body } = render(HomePage, { props: { data } });
		const cards = (body.match(/Goal \d/g) ?? []).length;
		expect(cards).toBeLessThanOrEqual(3);
	});

	it("the remainder is a single view-all link, not hidden data", () => {
		const { body } = render(HomePage, { props: { data } });
		expect(body).toContain("+ 6 more goals");
		expect(body).toContain('href="/goals"');
	});
});
