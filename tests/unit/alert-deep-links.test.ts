import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const selectChain = {
	from: vi.fn().mockReturnThis(),
	where: vi.fn().mockResolvedValue([]),
};

vi.mock("$lib/db/client", () => ({
	db: {
		query: {
			accounts: { findMany: vi.fn() },
			goals: { findMany: vi.fn() },
		},
		select: vi.fn(() => selectChain),
	},
}));

vi.mock("$lib/auth/row-security", () => ({
	withUserFilter: vi.fn(() => ({})),
}));

vi.mock("$lib/server/derivedBalances", () => ({
	getCurrentBalancesForAccounts: vi.fn(),
}));

vi.mock("$lib/server/logger", () => ({
	devLog: vi.fn(),
	logError: vi.fn(),
	logInfo: vi.fn(),
	isVerboseDebug: vi.fn(() => false),
}));

vi.mock("$lib/server/tax-year-queries", () => ({
	getISAAllowanceUsed: vi.fn(),
	getActualInterestEarned: vi.fn(),
}));

vi.mock("$lib/server/budgets", () => ({
	getBudgetStatus: vi.fn(),
	getCategoryBreakdown: vi.fn(),
	UNCATEGORISED_ID: -1,
}));

vi.mock("$lib/server/goals", () => ({
	getDebtGoalProgress: vi.fn(),
}));

vi.mock("$lib/server/isaPacing", () => ({
	calculateISAPacing: vi.fn(),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

import type { AccountRow, TxSummary } from "$lib/server/alerts/constants";

function account(overrides: Partial<Record<string, unknown>> = {}): AccountRow {
	return {
		id: 1,
		userId: 1,
		slug: "acme-savings",
		name: "Acme Savings",
		type: "savings",
		category: "asset",
		taxWrapper: "none",
		liquidity: "instant",
		institution: null,
		openedAt: new Date(),
		closedAt: null,
		maturityDate: null,
		creditLimit: null,
		originalPrincipal: null,
		minimumPaymentType: "flat",
		minimumPaymentFlat: null,
		minimumPaymentPercentage: null,
		startingBalanceInCents: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	} as unknown as AccountRow;
}

const NO_SUMMARY: TxSummary = {
	latestTxDate: null,
	hasPaymentThisMonth: false,
	hasDisbursement: true,
	lastAccruedDate: null,
	lastInterestDate: null,
	hasIsaDepositThisTaxYear: true,
};

// Unix seconds helper — schema stores transactionDate as seconds
const unixSecs = (y: number, m: number, d: number) =>
	Date.UTC(y, m - 1, d) / 1000;

// ─── Account-level actionable types ─────────────────────────────────────────

describe("alert deep links: account-level alerts link to the account ledger", () => {
	it("maturity alert links to the account ledger (slug-based)", async () => {
		const { checkMaturityAlerts } = await import(
			"$lib/server/alerts/sync-checkers"
		);
		const maturity = new Date();
		maturity.setDate(maturity.getDate() + 10);

		const alerts = checkMaturityAlerts(
			[account({ maturityDate: maturity })],
			new Date(),
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].type).toBe("MATURITY_SOON_30");
		expect(alerts[0].href).toBe("/accounts/acme-savings");
	});

	it("NO_LIABILITY_PAYMENT links to the ledger with the current month", async () => {
		const { checkLiabilityPaymentAlerts } = await import(
			"$lib/server/alerts/sync-checkers"
		);
		const now = new Date(Date.UTC(2026, 9, 15)); // 15 Oct — past grace period
		const loan = account({
			slug: "car-loan",
			type: "loan",
			category: "liability",
		});

		const alerts = checkLiabilityPaymentAlerts(
			[loan],
			new Map([[loan.id, NO_SUMMARY]]),
			now,
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].href).toBe("/accounts/car-loan?month=2026-10");
	});

	it("INTEREST_ACCRUED_UNPOSTED links to the ledger prefiltered by type + accrual month", async () => {
		const { checkInterestAccruedAlerts } = await import(
			"$lib/server/alerts/sync-checkers"
		);
		const now = new Date(Date.UTC(2026, 9, 15));
		const lastAccrued = new Date(Date.UTC(2026, 4, 20)); // 2026-05, >90d ago
		const summary: TxSummary = {
			...NO_SUMMARY,
			lastAccruedDate: lastAccrued,
			lastInterestDate: null,
		};

		const alerts = checkInterestAccruedAlerts(
			[account()],
			new Map([[1, summary]]),
			now,
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].href).toBe(
			"/accounts/acme-savings?type=interest_accrued&month=2026-05",
		);
	});
});

// ─── Goal alerts ─────────────────────────────────────────────────────────────

describe("alert deep links: goal alerts link to the goal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("GOAL_DEADLINE_APPROACHING links to /goals/[slug]", async () => {
		const { checkGoalAlerts } = await import("$lib/server/alerts/async-goals");
		const { db } = await import("$lib/db/client");

		const targetDate = new Date();
		targetDate.setDate(targetDate.getDate() + 15);

		vi.mocked(db.query.goals.findMany).mockResolvedValue([
			{
				id: 2,
				name: "Vacation",
				goalType: "savings",
				currentAllocation: 5000,
				targetAmountInCents: 100000,
				targetDate,
				startingBalanceInCents: null,
				linkedAccountId: null,
				slug: "vacation",
				userId: 1,
				deletedAt: null,
			},
		] as any);

		const alerts = await checkGoalAlerts(1);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].type).toBe("GOAL_DEADLINE_APPROACHING");
		expect(alerts[0].href).toBe("/goals/vacation");
	});
});

// ─── Budget alerts ───────────────────────────────────────────────────────────

describe("alert deep links: budget alerts link to the budget month", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("BUDGET_OVERSPEND links to /overview/budgets/[current-month]", async () => {
		const { checkBudgetAlerts } = await import("$lib/server/alerts/async-goals");
		const { getBudgetStatus, getCategoryBreakdown } = await import(
			"$lib/server/budgets"
		);

		vi.mocked(getBudgetStatus).mockResolvedValue({
			budget: { totalTargetInCents: 100000 },
			totalSpent: 150000,
			daysElapsed: 15,
			totalDays: 30,
			projectedTotal: 300000,
		} as any);
		vi.mocked(getCategoryBreakdown).mockResolvedValue([] as any);

		const alerts = await checkBudgetAlerts(1);

		const now = new Date();
		const monthSlug = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
		const overspend = alerts.find((a) => a.type === "BUDGET_OVERSPEND");
		expect(overspend).toBeDefined();
		expect(overspend?.href).toBe(`/overview/budgets/${monthSlug}`);
	});
});

// ─── ISA / PSA alerts ────────────────────────────────────────────────────────

describe("alert deep links: ISA + PSA alerts link to report pages", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("ISA_FULL links to /accounts/isa", async () => {
		const { checkIsaAlerts } = await import("$lib/server/alerts/async-isa");
		const { getISAAllowanceUsed } = await import(
			"$lib/server/tax-year-queries"
		);

		vi.mocked(getISAAllowanceUsed).mockResolvedValue(2_000_000); // £20,000

		const taxYear = {
			start: new Date(Date.UTC(2026, 3, 6)),
			end: new Date(Date.UTC(2027, 3, 5)),
		};
		const alerts = await checkIsaAlerts(1, taxYear);

		expect(alerts).toHaveLength(1);
		expect(alerts[0].type).toBe("ISA_FULL");
		expect(alerts[0].href).toBe("/accounts/isa");
	});

	it("PSA_EXCEEDED links to the current tax year interest report", async () => {
		const { checkPsaAlerts } = await import("$lib/server/alerts/async-isa");
		const { getActualInterestEarned } = await import(
			"$lib/server/tax-year-queries"
		);

		vi.mocked(getActualInterestEarned).mockResolvedValue(150000); // £1,500 > £1,000

		const taxYear = {
			start: new Date(Date.UTC(2026, 3, 6)),
			end: new Date(Date.UTC(2027, 3, 5)),
		};
		const alerts = await checkPsaAlerts(1, taxYear, "basic", true);

		expect(alerts).toHaveLength(1);
		expect(alerts[0].type).toBe("PSA_EXCEEDED");
		expect(alerts[0].href).toBe("/accounts/interest/2026-27");
	});
});

// ─── Unmatched transfers ─────────────────────────────────────────────────────

describe("alert deep links: unmatched-transfer link shape", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		selectChain.from.mockReturnThis();
	});

	async function seedTransferRows(rows: Array<Record<string, unknown>>) {
		const { db } = await import("$lib/db/client");
		vi.mocked(db.query.accounts.findMany).mockResolvedValue([
			account({ id: 1, slug: "acme-savings", name: "Acme Savings" }),
			account({ id: 2, slug: "barclays-current", name: "Barclays Current" }),
		] as any);
		vi.mocked(db.select).mockReturnValue(selectChain as any);
		selectChain.where.mockResolvedValue(rows as any);
	}

	it("primary link is the transfer_in ledger prefiltered by type + month, with a secondary counterpart", async () => {
		const { checkOrphanedTransfers } = await import(
			"$lib/server/alerts/async-accounts"
		);

		// 10 Sep transfer_in on account 1; counterpart out is 3 days later
		// (outside the ±1d match, inside the ±5d candidate window)
		await seedTransferRows([
			{
				id: 101,
				accountId: 1,
				amount: 50000,
				type: "transfer_in",
				transactionDate: unixSecs(2026, 9, 10),
			},
			{
				id: 102,
				accountId: 2,
				amount: -50000,
				type: "transfer_out",
				transactionDate: unixSecs(2026, 9, 13),
			},
		]);

		const alerts = await checkOrphanedTransfers(1);
		expect(alerts).toHaveLength(1);

		const alert = alerts[0];
		expect(alert.type).toBe("ORPHANED_TRANSFER");
		// Slug-based, no numeric IDs anywhere in the links
		expect(alert.href).toBe("/accounts/acme-savings?type=transfer_in&month=2026-09");
		expect(alert.href).not.toMatch(/\/\d+|\bid=|accountId/);
		expect(alert.secondaryHref).toBe(
			"/accounts/barclays-current?type=transfer_out&month=2026-09",
		);
		expect(alert.secondaryLabel).toBe("Out: Barclays Current");
	});

	it("no secondary link when no same-amount counterpart candidate exists", async () => {
		const { checkOrphanedTransfers } = await import(
			"$lib/server/alerts/async-accounts"
		);

		await seedTransferRows([
			{
				id: 101,
				accountId: 1,
				amount: 50000,
				type: "transfer_in",
				transactionDate: unixSecs(2026, 9, 10),
			},
			{
				id: 103,
				accountId: 2,
				amount: -75000, // different amount — not a candidate
				type: "transfer_out",
				transactionDate: unixSecs(2026, 9, 11),
			},
		]);

		const alerts = await checkOrphanedTransfers(1);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].href).toBe("/accounts/acme-savings?type=transfer_in&month=2026-09");
		expect(alerts[0].secondaryHref).toBeUndefined();
	});

	it("matched pairs (±1 day, same amount) raise no alert", async () => {
		const { checkOrphanedTransfers } = await import(
			"$lib/server/alerts/async-accounts"
		);

		await seedTransferRows([
			{
				id: 101,
				accountId: 1,
				amount: 50000,
				type: "transfer_in",
				transactionDate: unixSecs(2026, 9, 10),
			},
			{
				id: 102,
				accountId: 2,
				amount: -50000,
				type: "transfer_out",
				transactionDate: unixSecs(2026, 9, 11), // within ±1 day
			},
		]);

		const alerts = await checkOrphanedTransfers(1);
		expect(alerts).toHaveLength(0);
	});
});

// ─── Linkless alerts are deliberate ─────────────────────────────────────────

describe("alert deep links: linkless alerts are deliberate", () => {
	it("makeGlobalAlert without an href renders linkless (href optional by design)", async () => {
		const { makeGlobalAlert } = await import("$lib/server/alerts/constants");

		const alert = makeGlobalAlert(
			"TAX_YEAR_INTEREST_REVIEW" as any,
			"info",
			"Informational note",
			"No actionable destination",
			// no href — future informational types (e.g. market notes)
		);

		expect(alert.href).toBeUndefined();
		// The render layer treats a missing href as linkless
		// (AlertBadge.svelte / AlertGroup.svelte `{#if alert.href}` guards)
		expect(Boolean(alert.href)).toBe(false);
	});
});
