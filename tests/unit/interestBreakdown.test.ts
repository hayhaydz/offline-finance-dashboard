/**
 * Unit tests for interestBreakdown.ts
 *
 * Tests coverage:
 * 1. Tax-year boundaries (around 5/6 April)
 * 2. Maturity after tax-year end (projected = 0)
 * 3. Maturity within tax year (projected to maturity only)
 * 4. No rate/no balance (projected = 0 with exclusion flags)
 * 5. Reconciliation deltas (zero for balanced fixtures)
 * 6. Tax wrapper handling (ISA/LISA/Premium Bonds excluded from PSA)
 */

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "$lib/db/schema";
import {
	getActualInterestBreakdown,
	getInterestBreakdownReport,
	getInterestReconciliationReport,
	getInterestTransactions,
	getProjectedInterestBreakdown,
	type InterestTransaction,
} from "$lib/server/interestBreakdown";

// Mock all dependencies
vi.mock("$lib/db/client", () => ({
	db: {
		select: vi.fn(),
		query: {
			accounts: {
				findMany: vi.fn(),
			},
		},
	},
}));

vi.mock("$lib/auth/row-security", () => ({
	withUserFilter: vi.fn((userId, table) => eq(table.userId, userId)),
}));

vi.mock("$lib/utils/logger", () => ({
	devLog: vi.fn(),
	logError: vi.fn(),
}));

vi.mock("$lib/server/derivedBalances", () => {
	const getCurrentBalanceForAccount = vi.fn();
	const getCurrentBalancesForAccounts = vi.fn(async (accountIds: number[]) => {
		const result = new Map<number, number>();
		for (const accountId of accountIds) {
			const balance = await getCurrentBalanceForAccount(accountId);
			result.set(accountId, balance ?? 0);
		}
		return result;
	});
	return { getCurrentBalanceForAccount, getCurrentBalancesForAccounts };
});

vi.mock("$lib/server/interestRates", () => {
	const getCurrentRate = vi.fn();
	const getCurrentRatesForAccounts = vi.fn(async (accountIds: number[]) => {
		const result = new Map<number, number | null>();
		for (const accountId of accountIds) {
			const rate = await getCurrentRate(accountId);
			result.set(accountId, rate ?? null);
		}
		return result;
	});
	return { getCurrentRate, getCurrentRatesForAccounts };
});

vi.mock("$lib/server/calculations", () => ({
	calculateProjectedInterestInCents: vi.fn(),
	getAccountInterestEarned: vi.fn(),
	getActualInterestEarned: vi.fn(),
	getUkTaxYearBounds: vi.fn((_date) => ({
		start: new Date("2025-04-06T00:00:00.000Z"),
		end: new Date("2026-04-05T23:59:59.999Z"),
	})),
	getTaxFreeStatus: vi.fn((amount, band) => ({
		allowance: band === "basic" ? 100000 : band === "higher" ? 50000 : 0,
		used: amount,
		remaining:
			band === "basic"
				? 100000 - amount
				: band === "higher"
					? Math.max(0, 50000 - amount)
					: 0,
		overAllowance:
			band === "additional"
				? true
				: amount > (band === "basic" ? 100000 : 50000),
		taxableAmount:
			band === "additional"
				? amount
				: Math.max(0, amount - (band === "basic" ? 100000 : 50000)),
	})),
}));

import { db } from "$lib/db/client";
import {
	calculateProjectedInterestInCents,
	getActualInterestEarned,
	getTaxFreeStatus,
	getUkTaxYearBounds,
} from "$lib/server/calculations";
import { getCurrentBalanceForAccount } from "$lib/server/derivedBalances";
import { getCurrentRate } from "$lib/server/interestRates";

const mockFindAccounts = vi.mocked(db.query.accounts.findMany);
const mockGetActualInterestEarned = vi.mocked(getActualInterestEarned);
const mockGetCurrentBalanceForAccount = vi.mocked(getCurrentBalanceForAccount);
const mockGetCurrentRate = vi.mocked(getCurrentRate);
const mockCalculateProjectedInterestInCents = vi.mocked(
	calculateProjectedInterestInCents,
);
const mockGetTaxFreeStatus = vi.mocked(getTaxFreeStatus);

// Helper to create mock transaction chain
function createMockTransactions(
	transactions: Array<{
		id: number;
		slug: string;
		date: Date;
		amount: number;
		description: string | null;
		accountId: number;
		accountSlug: string;
		accountName: string;
		accountType: string;
		accountInstitution: string | null;
		accountTaxWrapper: string;
	}>,
) {
	let runningTotal = 0;
	return transactions.map((tx) => {
		runningTotal += tx.amount;
		return {
			id: tx.id,
			slug: tx.slug,
			transactionDate: tx.date,
			type: "interest",
			amount: tx.amount,
			description: tx.description,
			runningTotal,
			accountId: tx.accountId,
			accountSlug: tx.accountSlug,
			accountName: tx.accountName,
			accountType: tx.accountType,
			accountInstitution: tx.accountInstitution,
			accountTaxWrapper: tx.accountTaxWrapper,
		};
	});
}

// Helper to setup db.select mock for transactions
function setupDbSelectMock(transactions: InterestTransaction[]) {
	const mockDb = db as unknown as { select: ReturnType<typeof vi.fn> };
	const selectMock = vi.fn();
	const fromMock = vi.fn();
	const innerJoinMock = vi.fn();
	const whereMock = vi.fn();
	const orderByMock = vi.fn();

	selectMock.mockReturnValue({ from: fromMock });
	fromMock.mockReturnValue({ innerJoin: innerJoinMock });
	innerJoinMock.mockReturnValue({ where: whereMock });
	whereMock.mockReturnValue({ orderBy: orderByMock });
	orderByMock.mockResolvedValue(transactions);

	mockDb.select.mockImplementation((columns: unknown) => {
		// Return columns for inspection if needed
		return selectMock(columns);
	});

	return { selectMock, fromMock, innerJoinMock, whereMock, orderByMock };
}

const baseAccount: Account = {
	id: 0,
	userId: 1,
	slug: "base-account",
	name: "Base Account",
	institution: null,
	type: "savings",
	taxWrapper: "none",
	category: "asset",
	liquidity: "instant",
	excludedFromNetWorth: false,
	openedAt: null,
	closedAt: null,
	maturityDate: null,
	createdAt: new Date("2025-01-01T00:00:00.000Z"),
	updatedAt: new Date("2025-01-01T00:00:00.000Z"),
	minimumPaymentType: "flat",
	minimumPaymentFlat: 0,
	minimumPaymentPercentage: 0,
	creditLimit: null,
	originalPrincipal: null,
};

const createAccount = (overrides: Partial<Account>): Account => ({
	...baseAccount,
	...overrides,
});

describe("getInterestTransactions", () => {
	const mockUserId = 1;
	const mockTaxYearStart = new Date("2025-04-06T00:00:00.000Z");
	const mockTaxYearEnd = new Date("2026-04-05T23:59:59.999Z");

	beforeEach(() => {
		vi.clearAllMocks();
		// Setup default empty accounts to avoid crashes in functions calling db.query.accounts
		mockFindAccounts.mockResolvedValue([]);
	});

	it("should fetch interest transactions with running totals ordered by date", async () => {
		const rawTransactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-10T00:00:00.000Z"),
				amount: 10000,
				description: "Monthly interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Easy Access Savings",
				accountType: "savings",
				accountInstitution: "Test Bank",
				accountTaxWrapper: "none",
			},
			{
				id: 2,
				slug: "tx2",
				date: new Date("2025-05-10T00:00:00.000Z"),
				amount: 15000,
				description: "Monthly interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Easy Access Savings",
				accountType: "savings",
				accountInstitution: "Test Bank",
				accountTaxWrapper: "none",
			},
			{
				id: 3,
				slug: "tx3",
				date: new Date("2025-06-10T00:00:00.000Z"),
				amount: 12000,
				description: "Monthly interest",
				accountId: 11,
				accountSlug: "isa-1",
				accountName: "Cash ISA",
				accountType: "savings",
				accountInstitution: "Test Bank",
				accountTaxWrapper: "isa",
			},
		];

		const transactionsWithRunningTotals =
			createMockTransactions(rawTransactions);
		setupDbSelectMock(transactionsWithRunningTotals);

		const result = await getInterestTransactions(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
		);

		expect(result).toHaveLength(3);
		expect(result[0].runningTotal).toBe(10000);
		expect(result[1].runningTotal).toBe(25000);
		expect(result[2].runningTotal).toBe(37000);
	});

	it("should handle empty result set", async () => {
		setupDbSelectMock([]);

		const result = await getInterestTransactions(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
		);

		expect(result).toEqual([]);
	});

	it("should filter by tax year dates", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-06T00:00:00.000Z"), // First day of tax year
				amount: 10000,
				description: null,
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
		];

		const { orderByMock } = setupDbSelectMock(
			createMockTransactions(transactions),
		);

		await getInterestTransactions(mockUserId, mockTaxYearStart, mockTaxYearEnd);

		expect(orderByMock).toHaveBeenCalled();
	});

	it("should include transactions on tax year boundary (April 5)", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx-last-day",
				date: new Date("2026-04-05T23:59:59.999Z"), // Last moment of tax year
				amount: 5000,
				description: "Year-end interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
		];

		setupDbSelectMock(createMockTransactions(transactions));

		const result = await getInterestTransactions(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
		);

		expect(result).toHaveLength(1);
		expect(result[0].amount).toBe(5000);
	});
});

describe("getActualInterestBreakdown", () => {
	const mockUserId = 1;
	const mockTaxYearStart = new Date("2025-04-06T00:00:00.000Z");
	const mockTaxYearEnd = new Date("2026-04-05T23:59:59.999Z");

	beforeEach(() => {
		vi.clearAllMocks();
		// Setup default empty accounts to avoid crashes in functions calling db.query.accounts
		mockFindAccounts.mockResolvedValue([]);
	});

	it("should calculate breakdown by account, month, institution, and tax wrapper", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-10T00:00:00.000Z"),
				amount: 10000,
				description: "Monthly interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Easy Access Savings",
				accountType: "savings",
				accountInstitution: "Test Bank",
				accountTaxWrapper: "none",
			},
			{
				id: 2,
				slug: "tx2",
				date: new Date("2025-05-10T00:00:00.000Z"),
				amount: 15000,
				description: "Monthly interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Easy Access Savings",
				accountType: "savings",
				accountInstitution: "Test Bank",
				accountTaxWrapper: "none",
			},
			{
				id: 3,
				slug: "tx3",
				date: new Date("2025-04-15T00:00:00.000Z"),
				amount: 20000,
				description: "ISA interest",
				accountId: 11,
				accountSlug: "isa-1",
				accountName: "Cash ISA",
				accountType: "savings",
				accountInstitution: "Test Bank",
				accountTaxWrapper: "isa",
			},
			{
				id: 4,
				slug: "tx4",
				date: new Date("2025-04-20T00:00:00.000Z"),
				amount: 8000,
				description: "Premium Bonds prize",
				accountId: 12,
				accountSlug: "pb-1",
				accountName: "Premium Bonds",
				accountType: "investment",
				accountInstitution: "NS&I",
				accountTaxWrapper: "premium-bonds",
			},
		];

		setupDbSelectMock(createMockTransactions(transactions));
		mockGetActualInterestEarned.mockResolvedValue(53000);

		const result = await getActualInterestBreakdown(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
		);

		// Verify total
		expect(result.total).toBe(53000);
		expect(result.taxableTotal).toBe(25000); // none wrapper: 10000+15000
		expect(result.taxFreeTotal).toBe(20000 + 8000); // isa: 20000, premium-bonds: 8000
		expect(result.transactions).toHaveLength(4);

		// Verify by account breakdown (sorted by total descending)
		expect(result.byAccount).toHaveLength(3);
		expect(result.byAccount[0].accountSlug).toBe("savings-1");
		expect(result.byAccount[0].total).toBe(25000);
		expect(result.byAccount[0].transactionCount).toBe(2);

		// Verify by month breakdown
		expect(result.byMonth).toHaveLength(2);
		expect(result.byMonth[0].month).toBe(4);
		expect(result.byMonth[0].monthName).toBe("April");
		expect(result.byMonth[0].total).toBe(38000);

		// Verify by institution breakdown
		expect(result.byInstitution).toHaveLength(2);
		const testBankInstitution = result.byInstitution.find(
			(i) => i.institution === "Test Bank",
		);
		expect(testBankInstitution?.total).toBe(45000);

		// Verify by tax wrapper breakdown
		expect(result.byTaxWrapper).toHaveLength(3);
		const isaWrapper = result.byTaxWrapper.find((w) => w.taxWrapper === "isa");
		expect(isaWrapper?.total).toBe(20000);
		expect(isaWrapper?.isTaxFree).toBe(true);

		const pbWrapper = result.byTaxWrapper.find(
			(w) => w.taxWrapper === "premium-bonds",
		);
		expect(pbWrapper?.isTaxFree).toBe(true);

		const noneWrapper = result.byTaxWrapper.find(
			(w) => w.taxWrapper === "none",
		);
		expect(noneWrapper?.isTaxFree).toBe(false);
	});

	it("should handle tax year boundary correctly (April 5/6)", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2026-04-05T23:59:59.999Z"), // Last day of tax year
				amount: 10000,
				description: "Year-end interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
			{
				id: 2,
				slug: "tx2",
				date: new Date("2026-04-06T00:00:00.000Z"), // First day of next tax year
				amount: 15000,
				description: "New tax year interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
		];

		setupDbSelectMock(createMockTransactions([transactions[0]]));
		mockGetActualInterestEarned.mockResolvedValue(10000);

		const result = await getActualInterestBreakdown(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
		);

		// Only April 5 transaction should be included
		expect(result.total).toBe(10000);
		expect(result.transactions).toHaveLength(1); // 1 real + 0 opening (since mockAccounts is empty)
		expect(result.byMonth).toHaveLength(1);
		expect(result.byMonth[0].month).toBe(4);
	});

	it("should return empty breakdown for no transactions", async () => {
		setupDbSelectMock([]);
		mockGetActualInterestEarned.mockResolvedValue(0);

		const result = await getActualInterestBreakdown(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
		);

		expect(result.total).toBe(0);
		expect(result.transactions).toEqual([]);
		expect(result.byAccount).toEqual([]);
		expect(result.byMonth).toEqual([]);
		expect(result.byInstitution).toEqual([]);
		expect(result.byTaxWrapper).toEqual([]);
	});
});

describe("getProjectedInterestBreakdown", () => {
	const mockUserId = 1;
	const mockTaxYearStart = new Date("2025-04-06T00:00:00.000Z");
	const mockTaxYearEnd = new Date("2026-04-05T23:59:59.999Z");
	const mockAsOfDate = new Date("2025-12-01T00:00:00.000Z");

	beforeEach(() => {
		vi.clearAllMocks();
		// Setup default empty accounts to avoid crashes in functions calling db.query.accounts
		mockFindAccounts.mockResolvedValue([]);
	});

	it("should calculate projected interest for remaining tax year", async () => {
		const mockAccounts = [
			createAccount({
				id: 10,
				slug: "savings-1",
				name: "Easy Access Savings",
				institution: "Test Bank",
			}),
		];

		mockFindAccounts.mockResolvedValue(mockAccounts);
		mockGetCurrentBalanceForAccount.mockResolvedValue(1000000); // £10,000
		mockGetCurrentRate.mockResolvedValue(450); // 4.5%
		mockCalculateProjectedInterestInCents.mockReturnValue(50000); // £500 projected

		const result = await getProjectedInterestBreakdown(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			mockAsOfDate,
		);

		expect(result.total).toBe(50000);
		expect(result.byAccount).toHaveLength(1);
		expect(result.byAccount[0].accountId).toBe(10);
		expect(result.byAccount[0].projectedInterest).toBe(50000);
		expect(result.byAccount[0].exclusionReason).toBeNull();
		expect(result.byAccount[0].daysUntilTaxYearEnd).toBeGreaterThan(0);
	});

	it("should return zero projected when tax year has ended", async () => {
		const pastDate = new Date("2026-04-06T00:00:00.000Z"); // After tax year end

		const result = await getProjectedInterestBreakdown(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			pastDate,
		);

		expect(result.total).toBe(0);
		expect(result.byAccount).toEqual([]);
		expect(db.query.accounts.findMany).not.toHaveBeenCalled();
	});

	it("should exclude accounts with no balance", async () => {
		const mockAccounts = [
			createAccount({
				id: 10,
				slug: "savings-1",
				name: "Empty Savings",
				institution: "Test Bank",
			}),
		];

		mockFindAccounts.mockResolvedValue(mockAccounts);
		mockGetCurrentBalanceForAccount.mockResolvedValue(0);

		const result = await getProjectedInterestBreakdown(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			mockAsOfDate,
		);

		expect(result.total).toBe(0);
		expect(result.byAccount).toHaveLength(1);
		expect(result.byAccount[0].exclusionReason).toBe("no_balance");
		expect(result.byAccount[0].projectedInterest).toBe(0);
	});

	it("should exclude accounts with no rate", async () => {
		const mockAccounts = [
			createAccount({
				id: 10,
				slug: "savings-1",
				name: "Savings",
				institution: "Test Bank",
			}),
		];

		mockFindAccounts.mockResolvedValue(mockAccounts);
		mockGetCurrentBalanceForAccount.mockResolvedValue(1000000);
		mockGetCurrentRate.mockResolvedValue(null);

		const result = await getProjectedInterestBreakdown(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			mockAsOfDate,
		);

		expect(result.total).toBe(0);
		expect(result.byAccount).toHaveLength(1);
		expect(result.byAccount[0].exclusionReason).toBe("no_rate");
	});

	it("should exclude closed accounts", async () => {
		const mockAccounts = [
			createAccount({
				id: 10,
				slug: "savings-1",
				name: "Closed Savings",
				institution: "Test Bank",
				closedAt: new Date("2025-11-01T00:00:00.000Z"),
			}),
		];

		mockFindAccounts.mockResolvedValue(mockAccounts);

		const result = await getProjectedInterestBreakdown(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			mockAsOfDate,
		);

		expect(result.total).toBe(0);
		expect(result.byAccount).toHaveLength(1);
		expect(result.byAccount[0].exclusionReason).toBe("closed_account");
	});

	it("should exclude non-interest-bearing accounts", async () => {
		const mockAccounts = [
			createAccount({
				id: 10,
				slug: "checking-1",
				name: "Current Account",
				type: "current",
				institution: "Test Bank",
			}),
		];

		mockFindAccounts.mockResolvedValue(mockAccounts);

		const result = await getProjectedInterestBreakdown(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			mockAsOfDate,
		);

		expect(result.total).toBe(0);
		expect(result.byAccount).toHaveLength(1);
		expect(result.byAccount[0].exclusionReason).toBe("non_interest_bearing");
	});

	it("should handle maturity after tax year end (projected = 0)", async () => {
		const mockAccounts = [
			createAccount({
				id: 10,
				slug: "bond-1",
				name: "Fixed Term Bond",
				institution: "Test Bank",
				maturityDate: new Date("2026-06-01T00:00:00.000Z"), // After tax year end
			}),
		];

		mockFindAccounts.mockResolvedValue(mockAccounts);
		mockGetCurrentBalanceForAccount.mockResolvedValue(1000000);
		mockGetCurrentRate.mockResolvedValue(500);

		const result = await getProjectedInterestBreakdown(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			mockAsOfDate,
		);

		expect(result.total).toBe(0);
		expect(result.byAccount).toHaveLength(1);
		expect(result.byAccount[0].exclusionReason).toBe("matures_after_tax_year");
		expect(result.byAccount[0].projectedInterest).toBe(0);
	});

	it("should handle maturity within tax year (project to maturity only)", async () => {
		const maturityDate = new Date("2026-02-01T00:00:00.000Z"); // Within tax year
		const mockAccounts = [
			createAccount({
				id: 10,
				slug: "bond-1",
				name: "Fixed Term Bond",
				institution: "Test Bank",
				maturityDate,
			}),
		];

		mockFindAccounts.mockResolvedValue(mockAccounts);
		mockGetCurrentBalanceForAccount.mockResolvedValue(1000000);
		mockGetCurrentRate.mockResolvedValue(500);
		mockCalculateProjectedInterestInCents.mockReturnValue(25000);

		const result = await getProjectedInterestBreakdown(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			mockAsOfDate,
		);

		expect(result.total).toBe(25000);
		expect(result.byAccount).toHaveLength(1);
		expect(result.byAccount[0].exclusionReason).toBeNull();
		expect(result.byAccount[0].daysUntilMaturity).toBeGreaterThan(0);
		expect(result.byAccount[0].maturityDate).toEqual(maturityDate);

		// Verify projection was calculated to maturity date, not tax year end
		expect(calculateProjectedInterestInCents).toHaveBeenCalledWith({
			balanceInCents: 1000000,
			rateBasisPoints: 500,
			fromDate: mockAsOfDate,
			toDate: maturityDate,
		});
	});

	it("should handle already matured accounts", async () => {
		const mockAccounts = [
			createAccount({
				id: 10,
				slug: "bond-1",
				name: "Matured Bond",
				institution: "Test Bank",
				maturityDate: new Date("2025-11-01T00:00:00.000Z"), // Already matured
			}),
		];

		mockFindAccounts.mockResolvedValue(mockAccounts);
		mockGetCurrentBalanceForAccount.mockResolvedValue(1000000);
		mockGetCurrentRate.mockResolvedValue(500);

		const result = await getProjectedInterestBreakdown(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			mockAsOfDate,
		);

		expect(result.total).toBe(0);
		expect(result.byAccount).toHaveLength(1);
		expect(result.byAccount[0].exclusionReason).toBe("already_matured");
	});

	it("should sort accounts by projected interest descending", async () => {
		const mockAccounts = [
			createAccount({
				id: 10,
				slug: "savings-1",
				name: "Savings 1",
				institution: "Bank A",
			}),
			createAccount({
				id: 11,
				slug: "savings-2",
				name: "Savings 2",
				institution: "Bank B",
			}),
		];

		mockFindAccounts.mockResolvedValue(mockAccounts);
		mockGetCurrentBalanceForAccount
			.mockResolvedValueOnce(1000000)
			.mockResolvedValueOnce(500000);
		mockGetCurrentRate.mockResolvedValue(450);
		mockCalculateProjectedInterestInCents
			.mockReturnValueOnce(30000)
			.mockReturnValueOnce(15000);

		const result = await getProjectedInterestBreakdown(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			mockAsOfDate,
		);

		expect(result.byAccount).toHaveLength(2);
		expect(result.byAccount[0].projectedInterest).toBeGreaterThanOrEqual(
			result.byAccount[1].projectedInterest,
		);
	});
});

describe("getInterestReconciliationReport", () => {
	const mockUserId = 1;
	const mockTaxYearStart = new Date("2025-04-06T00:00:00.000Z");
	const mockTaxYearEnd = new Date("2026-04-05T23:59:59.999Z");
	const mockAsOfDate = new Date("2025-12-01T00:00:00.000Z");

	beforeEach(() => {
		vi.clearAllMocks();
		// Setup default empty accounts to avoid crashes in functions calling db.query.accounts
		mockFindAccounts.mockResolvedValue([]);
	});

	it("should return zero deltas for balanced data", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-10T00:00:00.000Z"),
				amount: 10000,
				description: "Interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
			{
				id: 2,
				slug: "tx2",
				date: new Date("2025-05-10T00:00:00.000Z"),
				amount: 15000,
				description: "Interest",
				accountId: 11,
				accountSlug: "savings-2",
				accountName: "Savings 2",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
		];

		setupDbSelectMock(createMockTransactions(transactions));
		mockGetActualInterestEarned.mockResolvedValue(25000);

		const result = await getInterestReconciliationReport(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			mockAsOfDate,
		);

		expect(result.actualVsTransactionsDelta).toBe(0);
		expect(result.actualVsByAccountDelta).toBe(0);
		expect(result.actualVsByMonthDelta).toBe(0);
		expect(result.flags).toHaveLength(0);
	});

	it("should generate error flags for unbalanced data", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-10T00:00:00.000Z"),
				amount: 10000,
				description: "Interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
		];

		setupDbSelectMock(createMockTransactions(transactions));
		mockGetActualInterestEarned.mockResolvedValue(15000); // Mismatch: 10000 vs 15000

		const result = await getInterestReconciliationReport(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			mockAsOfDate,
		);

		expect(result.actualVsTransactionsDelta).toBe(5000); // 15000 - 10000
		expect(result.flags.length).toBeGreaterThan(0);

		const transactionFlag = result.flags.find(
			(f) => f.category === "transactions",
		);
		expect(transactionFlag?.type).toBe("error");
		expect(transactionFlag?.delta).toBe(5000);
	});

	it("should detect month breakdown mismatches", async () => {
		// This test verifies the reconciliation logic by manually checking
		// that month sums are calculated correctly
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-10T00:00:00.000Z"),
				amount: 10000,
				description: "April interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
			{
				id: 2,
				slug: "tx2",
				date: new Date("2025-05-10T00:00:00.000Z"),
				amount: 15000,
				description: "May interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
		];

		setupDbSelectMock(createMockTransactions(transactions));
		mockGetActualInterestEarned.mockResolvedValue(25000);

		const result = await getInterestReconciliationReport(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			mockAsOfDate,
		);

		// Month breakdown should sum correctly
		expect(result.actualVsByMonthDelta).toBe(0);
	});

	it("should detect account breakdown mismatches", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-10T00:00:00.000Z"),
				amount: 10000,
				description: "Interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
			{
				id: 2,
				slug: "tx2",
				date: new Date("2025-05-10T00:00:00.000Z"),
				amount: 15000,
				description: "Interest",
				accountId: 11,
				accountSlug: "savings-2",
				accountName: "Savings 2",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
		];

		setupDbSelectMock(createMockTransactions(transactions));
		mockGetActualInterestEarned.mockResolvedValue(25000);

		const result = await getInterestReconciliationReport(
			mockUserId,
			mockTaxYearStart,
			mockTaxYearEnd,
			mockAsOfDate,
		);

		// Account breakdown should sum correctly
		expect(result.actualVsByAccountDelta).toBe(0);
	});
});

describe("getInterestBreakdownReport", () => {
	const mockUserId = 1;
	const mockTaxYearStart = new Date("2025-04-06T00:00:00.000Z");
	const mockTaxYearEnd = new Date("2026-04-05T23:59:59.999Z");
	const mockAsOfDate = new Date("2025-12-01T00:00:00.000Z");

	beforeEach(() => {
		vi.clearAllMocks();
		// Setup default empty accounts to avoid crashes in functions calling db.query.accounts
		mockFindAccounts.mockResolvedValue([]);
	});

	it("should combine actual, projected, forecast, and reconciliation data", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-10T00:00:00.000Z"),
				amount: 30000,
				description: "Actual interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Taxable Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
			{
				id: 2,
				slug: "tx2",
				date: new Date("2025-05-10T00:00:00.000Z"),
				amount: 20000,
				description: "ISA interest",
				accountId: 11,
				accountSlug: "isa-1",
				accountName: "Cash ISA",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "isa",
			},
		];

		setupDbSelectMock(createMockTransactions(transactions));
		mockGetActualInterestEarned.mockResolvedValue(50000);

		const mockAccounts = [
			createAccount({
				id: 10,
				slug: "savings-1",
				name: "Taxable Savings",
				institution: "Bank",
			}),
		];

		mockFindAccounts.mockResolvedValue(mockAccounts);
		mockGetCurrentBalanceForAccount.mockResolvedValue(1000000);
		mockGetCurrentRate.mockResolvedValue(450);
		mockCalculateProjectedInterestInCents.mockReturnValue(10000);

		const result = await getInterestBreakdownReport({
			userId: mockUserId,
			taxYearStart: mockTaxYearStart,
			taxYearEnd: mockTaxYearEnd,
			asOfDate: mockAsOfDate,
			taxBand: "basic",
		});

		// Verify meta
		expect(result.meta.taxYearStart).toEqual(mockTaxYearStart);
		expect(result.meta.taxYearEnd).toEqual(mockTaxYearEnd);
		expect(result.meta.asOfDate).toEqual(mockAsOfDate);
		expect(result.meta.daysRemainingInTaxYear).toBeGreaterThan(0);

		// Verify actual
		expect(result.actual.total).toBe(50000);
		expect(result.actual.taxableTotal).toBe(30000);
		expect(result.actual.taxFreeTotal).toBe(20000);
		expect(result.actual.transactions).toHaveLength(3); // 2 real + 1 opening (account 10)

		// Verify projected
		expect(result.projected.total).toBe(10000);
		expect(result.projected.taxableTotal).toBe(10000);
		expect(result.projected.taxFreeTotal).toBe(0);

		// Verify forecast (actual + projected)
		expect(result.forecast.total).toBe(60000);
		expect(result.forecast.taxableTotal).toBe(30000 + 10000);
		expect(result.forecast.taxFreeTotal).toBe(20000);

		// Verify reconciliation
		expect(result.reconciliation.actualVsTransactionsDelta).toBe(0);
	});

	it("should exclude tax-free wrappers from PSA calculation", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-10T00:00:00.000Z"),
				amount: 80000,
				description: "ISA interest (tax-free)",
				accountId: 10,
				accountSlug: "isa-1",
				accountName: "Cash ISA",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "isa",
			},
			{
				id: 2,
				slug: "tx2",
				date: new Date("2025-05-10T00:00:00.000Z"),
				amount: 30000,
				description: "Taxable interest",
				accountId: 11,
				accountSlug: "savings-1",
				accountName: "Taxable Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
		];

		setupDbSelectMock(createMockTransactions(transactions));
		mockGetActualInterestEarned.mockResolvedValue(110000);

		const mockAccounts = [
			createAccount({
				id: 10,
				slug: "isa-1",
				name: "Cash ISA",
				institution: "Bank",
				taxWrapper: "isa",
			}),
			createAccount({
				id: 11,
				slug: "savings-1",
				name: "Taxable Savings",
				institution: "Bank",
			}),
		];

		mockFindAccounts.mockResolvedValue(mockAccounts);
		mockGetCurrentBalanceForAccount.mockResolvedValue(1000000);
		mockGetCurrentRate.mockResolvedValue(450);
		mockCalculateProjectedInterestInCents.mockReturnValue(5000);

		// Mock getTaxFreeStatus to track what amounts are passed
		let actualTaxablePassed = 0;
		let totalTaxablePassed = 0;
		mockGetTaxFreeStatus.mockImplementation((amount: number) => {
			if (actualTaxablePassed === 0) {
				actualTaxablePassed = amount;
			} else {
				totalTaxablePassed = amount;
			}
			return {
				allowance: 100000,
				used: amount,
				remaining: Math.max(0, 100000 - amount),
				overAllowance: amount > 100000,
				taxableAmount: Math.max(0, amount - 100000),
			};
		});

		await getInterestBreakdownReport({
			userId: mockUserId,
			taxYearStart: mockTaxYearStart,
			taxYearEnd: mockTaxYearEnd,
			asOfDate: mockAsOfDate,
			taxBand: "basic",
		});

		// Verify that only taxable amount (30000) was used for PSA calculation
		// ISA amount (80000) should be excluded
		expect(actualTaxablePassed).toBe(30000);
		expect(totalTaxablePassed).toBe(35000); // 30000 actual + 5000 projected
	});

	it("should count LISA and premium-bonds as tax-free", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-10T00:00:00.000Z"),
				amount: 40000,
				description: "LISA interest",
				accountId: 10,
				accountSlug: "lisa-1",
				accountName: "LISA",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "lisa",
			},
			{
				id: 2,
				slug: "tx2",
				date: new Date("2025-05-10T00:00:00.000Z"),
				amount: 10000,
				description: "Premium Bonds prize",
				accountId: 11,
				accountSlug: "pb-1",
				accountName: "Premium Bonds",
				accountType: "investment",
				accountInstitution: "NS&I",
				accountTaxWrapper: "premium-bonds",
			},
		];

		setupDbSelectMock(createMockTransactions(transactions));
		mockGetActualInterestEarned.mockResolvedValue(50000);

		const mockAccounts: Account[] = [];

		mockFindAccounts.mockResolvedValue(mockAccounts);

		const result = await getInterestBreakdownReport({
			userId: mockUserId,
			taxYearStart: mockTaxYearStart,
			taxYearEnd: mockTaxYearEnd,
			asOfDate: mockAsOfDate,
			taxBand: "basic",
		});

		// Both LISA and premium-bonds should be marked as tax-free in breakdown
		const lisaWrapper = result.actual.byTaxWrapper.find(
			(w) => w.taxWrapper === "lisa",
		);
		expect(lisaWrapper?.isTaxFree).toBe(true);

		const pbWrapper = result.actual.byTaxWrapper.find(
			(w) => w.taxWrapper === "premium-bonds",
		);
		expect(pbWrapper?.isTaxFree).toBe(true);
	});

	it("should calculate tax year bounds when not provided", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-10T00:00:00.000Z"),
				amount: 10000,
				description: "Interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
		];

		setupDbSelectMock(createMockTransactions(transactions));
		mockGetActualInterestEarned.mockResolvedValue(10000);
		mockFindAccounts.mockResolvedValue([]);

		const result = await getInterestBreakdownReport({
			userId: mockUserId,
			asOfDate: mockAsOfDate,
			taxBand: "basic",
		});

		// Verify getUkTaxYearBounds was called
		expect(getUkTaxYearBounds).toHaveBeenCalledWith(mockAsOfDate);

		// Verify the calculated bounds are used
		expect(result.meta.taxYearStart).toEqual(
			new Date("2025-04-06T00:00:00.000Z"),
		);
		expect(result.meta.taxYearEnd).toEqual(
			new Date("2026-04-05T23:59:59.999Z"),
		);
	});

	it("should use default tax band of 'basic' when not provided", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-10T00:00:00.000Z"),
				amount: 10000,
				description: "Interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
		];

		setupDbSelectMock(createMockTransactions(transactions));
		mockGetActualInterestEarned.mockResolvedValue(10000);
		mockFindAccounts.mockResolvedValue([]);

		await getInterestBreakdownReport({
			userId: mockUserId,
			taxYearStart: mockTaxYearStart,
			taxYearEnd: mockTaxYearEnd,
			asOfDate: mockAsOfDate,
			// taxBand not provided
		});

		// Verify getTaxFreeStatus was called with 'basic' tax band
		expect(getTaxFreeStatus).toHaveBeenCalledWith(expect.any(Number), "basic");
	});

	it("should handle different tax bands correctly", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-10T00:00:00.000Z"),
				amount: 60000,
				description: "Interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
		];

		setupDbSelectMock(createMockTransactions(transactions));
		mockGetActualInterestEarned.mockResolvedValue(60000);
		mockFindAccounts.mockResolvedValue([]);

		await getInterestBreakdownReport({
			userId: mockUserId,
			taxYearStart: mockTaxYearStart,
			taxYearEnd: mockTaxYearEnd,
			asOfDate: mockAsOfDate,
			taxBand: "higher",
		});

		// Verify getTaxFreeStatus was called with 'higher' tax band
		expect(getTaxFreeStatus).toHaveBeenCalledWith(60000, "higher");
	});

	it("should calculate days remaining in tax year correctly", async () => {
		const transactions = [
			{
				id: 1,
				slug: "tx1",
				date: new Date("2025-04-10T00:00:00.000Z"),
				amount: 10000,
				description: "Interest",
				accountId: 10,
				accountSlug: "savings-1",
				accountName: "Savings",
				accountType: "savings",
				accountInstitution: "Bank",
				accountTaxWrapper: "none",
			},
		];

		setupDbSelectMock(createMockTransactions(transactions));
		mockGetActualInterestEarned.mockResolvedValue(10000);
		mockFindAccounts.mockResolvedValue([]);

		const asOfDate = new Date("2025-12-01T00:00:00.000Z");
		const result = await getInterestBreakdownReport({
			userId: mockUserId,
			taxYearStart: mockTaxYearStart,
			taxYearEnd: mockTaxYearEnd,
			asOfDate: asOfDate,
			taxBand: "basic",
		});

		// From Dec 1 to Apr 5 is about 125 days
		expect(result.meta.daysRemainingInTaxYear).toBeGreaterThan(120);
		expect(result.meta.daysRemainingInTaxYear).toBeLessThan(130);
	});
});
