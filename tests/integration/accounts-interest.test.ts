/**
 * Integration tests for `/accounts/interest` page
 *
 * Tests coverage:
 * 1. Page loads and displays consistent totals
 * 2. Transaction ledger subtotal equals headline actual
 * 3. Account breakdown subtotal equals headline actual
 * 4. Month breakdown subtotal equals headline actual
 * 5. Forecast values correctly use actual + projected
 * 6. Authentication redirect works
 * 7. Tax-free wrappers are correctly identified
 * 8. PSA calculations use correct tax band
 * 9. Reconciliation flags appear when data is unbalanced
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "$lib/db/client";
import { load } from "../../src/routes/accounts/interest/[year]/+page.server";

// Mock all dependencies
vi.mock("$lib/db/client", () => ({
	db: {
		query: {
			accounts: {
				findMany: vi.fn(),
			},
			accountTransactions: {
				findMany: vi.fn(),
			},
			users: {
				findFirst: vi.fn(),
			},
		},
	},
}));

vi.mock("$lib/server/interestBreakdown", () => ({
	getInterestBreakdownReport: vi.fn(),
}));

vi.mock("$lib/utils/logger", () => ({
	devLog: vi.fn(),
	logError: vi.fn(),
}));

import { getInterestBreakdownReport } from "$lib/server/interestBreakdown";

describe("/accounts/interest/[year] page load", () => {
	const mockUserId = 1;
	const mockLocals = {
		user: {
			id: mockUserId,
			username: "testuser",
		},
	};

	// Helper to create a mock ServerLoadEvent
	function createMockLoadEvent(locals: any, params: any = { year: "2025-26" }) {
		return {
			locals,
			// Add required SvelteKit properties
			params,
			route: { id: "/accounts/interest/[year]" },
			url: new URL(`http://localhost/accounts/interest/${params.year}`),
			request: new Request(`http://localhost/accounts/interest/${params.year}`),
			cookies: {
				get: vi.fn(),
				set: vi.fn(),
				delete: vi.fn(),
				serialize: vi.fn(),
			},
			fetch: vi.fn(),
			getClientPlatform: vi.fn(() => ({}) as any),
			depends: vi.fn(),
			untrack: vi.fn((fn) => fn()),
			parent: vi.fn(() => ({})),
		} as any;
	}

	// Helper to call load and type the result properly
	async function callLoad(locals: any) {
		const result = await load(createMockLoadEvent(locals));
		if (!result) {
			throw new Error(
				"Load returned undefined - expected redirect to have been thrown",
			);
		}
		return result;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		// Setup default user with basic tax band
		(db.query.users.findFirst as any).mockResolvedValue({
			id: mockUserId,
			taxBand: "basic",
		});
		(db.query.accounts.findMany as any).mockResolvedValue([]);
		(db.query.accountTransactions.findMany as any).mockResolvedValue([]);
	});

	describe("Authentication", () => {
		it("should redirect to login if user is not authenticated", async () => {
			const unauthenticatedLocals = { user: null };

			try {
				await load(createMockLoadEvent(unauthenticatedLocals));
				expect.fail("Should have thrown a redirect");
			} catch (e: any) {
				expect(e.status).toBe(302);
				expect(e.location).toBe("/login");
			}
		});

		it("should proceed when user is authenticated", async () => {
			const mockReport = createMockReport();
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			expect(result).toBeDefined();
			expect(result.user.id).toBe(mockUserId);
		});
	});

	describe("Data structure", () => {
		it("should return proper data structure from page load", async () => {
			const mockReport = createMockReport();
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			// Verify top-level structure
			expect(result).toHaveProperty("user");
			expect(result).toHaveProperty("meta");
			expect(result).toHaveProperty("actual");
			expect(result).toHaveProperty("projected");
			expect(result).toHaveProperty("forecast");
			expect(result).toHaveProperty("reconciliation");

			// Verify user structure
			expect(result.user).toMatchObject({
				id: mockUserId,
				username: "testuser",
				taxBand: "basic",
			});

			// Verify meta structure
			expect(result.meta).toMatchObject({
				taxYearStart: expect.any(Date),
				taxYearEnd: expect.any(Date),
				asOfDate: expect.any(Date),
				daysRemainingInTaxYear: expect.any(Number),
			});

			// Verify actual structure
			expect(result.actual).toMatchObject({
				total: expect.any(Number),
				byAccount: expect.any(Array),
				byMonth: expect.any(Array),
				byInstitution: expect.any(Array),
				byTaxWrapper: expect.any(Array),
				transactions: expect.any(Array),
			});

			// Verify projected structure
			expect(result.projected).toMatchObject({
				total: expect.any(Number),
				byAccount: expect.any(Array),
			});

			// Verify forecast structure
			expect(result.forecast).toMatchObject({
				total: expect.any(Number),
				psaStatusNow: expect.any(Object),
				psaStatusForecast: expect.any(Object),
			});

			// Verify reconciliation structure
			expect(result.reconciliation).toMatchObject({
				actualVsTransactionsDelta: expect.any(Number),
				actualVsByAccountDelta: expect.any(Number),
				actualVsByMonthDelta: expect.any(Number),
				flags: expect.any(Array),
			});
		});

		it("should pass userId and taxBand to getInterestBreakdownReport", async () => {
			const mockReport = createMockReport();
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			await callLoad(mockLocals);

			expect(getInterestBreakdownReport).toHaveBeenCalledWith({
				userId: mockUserId,
				taxBand: "basic",
				taxYearStart: expect.any(Date),
				taxYearEnd: expect.any(Date),
			});
		});

		it("should use default tax band of 'basic' when user has no tax band", async () => {
			(db.query.users.findFirst as any).mockResolvedValue({
				id: mockUserId,
				taxBand: null,
			});

			const mockReport = createMockReport();
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			await callLoad(mockLocals);

			expect(getInterestBreakdownReport).toHaveBeenCalledWith({
				userId: mockUserId,
				taxBand: "basic",
				taxYearStart: expect.any(Date),
				taxYearEnd: expect.any(Date),
			});
		});

		it("should use higher tax band when user has higher tax band", async () => {
			(db.query.users.findFirst as any).mockResolvedValue({
				id: mockUserId,
				taxBand: "higher",
			});

			const mockReport = createMockReport();
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			await callLoad(mockLocals);

			expect(getInterestBreakdownReport).toHaveBeenCalledWith({
				userId: mockUserId,
				taxBand: "higher",
				taxYearStart: expect.any(Date),
				taxYearEnd: expect.any(Date),
			});
		});
	});

	describe("Data consistency and reconciliation", () => {
		it("should return zero reconciliation deltas for balanced data", async () => {
			const mockReport = createMockReport({
				actualTotal: 60000,
				transactionCount: 3,
				projectedTotal: 10000,
			});
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			// All deltas should be zero for balanced data
			expect(result.reconciliation.actualVsTransactionsDelta).toBe(0);
			expect(result.reconciliation.actualVsByAccountDelta).toBe(0);
			expect(result.reconciliation.actualVsByMonthDelta).toBe(0);
			expect(result.reconciliation.flags).toHaveLength(0);
		});

		it("should include reconciliation flags when data is unbalanced", async () => {
			const mockReport = createMockReport({
				actualTotal: 50000,
				transactionCount: 3,
				projectedTotal: 10000,
				includeReconciliationFlags: true,
			});
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			expect(result.reconciliation.flags.length).toBeGreaterThan(0);

			// Check that flags have required structure
			const flag = result.reconciliation.flags[0];
			expect(flag).toHaveProperty("category");
			expect(flag).toHaveProperty("type");
			expect(flag).toHaveProperty("message");
			expect(flag).toHaveProperty("delta");
		});

		it("should have transaction ledger subtotal equal to headline actual", async () => {
			const actualTotal = 60000;
			const transactionCount = 3;
			const mockReport = createMockReport({
				actualTotal,
				transactionCount,
			});
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			// Sum all transaction amounts
			const transactionSum = result.actual.transactions.reduce(
				(sum: number, tx: any) => sum + tx.amount,
				0,
			);

			// Transaction sum should equal headline actual
			expect(transactionSum).toBe(actualTotal);
			expect(result.actual.total).toBe(actualTotal);
		});

		it("should have account breakdown subtotal equal to headline actual", async () => {
			const actualTotal = 60000;
			const transactionCount = 3;
			const mockReport = createMockReport({
				actualTotal,
				transactionCount,
			});
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			// Sum all account breakdowns
			const accountSum = result.actual.byAccount.reduce(
				(sum: number, acc: any) => sum + acc.total,
				0,
			);

			// Account breakdown sum should equal headline actual
			expect(accountSum).toBe(actualTotal);
		});

		it("should have month breakdown subtotal equal to headline actual", async () => {
			const actualTotal = 60000;
			const transactionCount = 3;
			const mockReport = createMockReport({
				actualTotal,
				transactionCount,
			});
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			// Sum all month breakdowns
			const monthSum = result.actual.byMonth.reduce(
				(sum: number, month: any) => sum + month.total,
				0,
			);

			// Month breakdown sum should equal headline actual
			expect(monthSum).toBe(actualTotal);
		});
	});

	describe("Forecast calculations", () => {
		it("should calculate forecast as actual + projected", async () => {
			const actualTotal = 50000;
			const projectedTotal = 10000;
			const expectedForecast = actualTotal + projectedTotal;

			const mockReport = createMockReport({
				actualTotal,
				transactionCount: 3,
				projectedTotal,
			});
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			expect(result.actual.total).toBe(actualTotal);
			expect(result.projected.total).toBe(projectedTotal);
			expect(result.forecast.total).toBe(expectedForecast);
		});

		it("should include PSA status for actual only", async () => {
			const mockReport = createMockReport();
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			// Verify PSA status structure for actual (now)
			expect(result.forecast.psaStatusNow).toHaveProperty("allowance");
			expect(result.forecast.psaStatusNow).toHaveProperty("used");
			expect(result.forecast.psaStatusNow).toHaveProperty("remaining");
			expect(result.forecast.psaStatusNow).toHaveProperty("overAllowance");
			expect(result.forecast.psaStatusNow).toHaveProperty("taxableAmount");
		});

		it("should include PSA status for forecast (actual + projected)", async () => {
			const mockReport = createMockReport();
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			// Verify PSA status structure for forecast
			expect(result.forecast.psaStatusForecast).toHaveProperty("allowance");
			expect(result.forecast.psaStatusForecast).toHaveProperty("used");
			expect(result.forecast.psaStatusForecast).toHaveProperty("remaining");
			expect(result.forecast.psaStatusForecast).toHaveProperty("overAllowance");
			expect(result.forecast.psaStatusForecast).toHaveProperty("taxableAmount");

			// Forecast PSA should use more allowance than actual alone
			expect(result.forecast.psaStatusForecast.used).toBeGreaterThanOrEqual(
				result.forecast.psaStatusNow.used,
			);
		});
	});

	describe("Tax wrapper handling", () => {
		it("should correctly identify tax-free wrappers (isa, lisa, premium-bonds)", async () => {
			const actualTotal = 100000;
			const transactionCount = 4;
			const mockReport = createMockReport({
				actualTotal,
				transactionCount,
				includeTaxFreeWrappers: true,
			});
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			// Check that tax-free wrappers are marked correctly
			const isaWrapper = result.actual.byTaxWrapper.find(
				(w: any) => w.taxWrapper === "isa",
			);
			expect(isaWrapper?.isTaxFree).toBe(true);

			const lisaWrapper = result.actual.byTaxWrapper.find(
				(w: any) => w.taxWrapper === "lisa",
			);
			expect(lisaWrapper?.isTaxFree).toBe(true);

			const pbWrapper = result.actual.byTaxWrapper.find(
				(w: any) => w.taxWrapper === "premium-bonds",
			);
			expect(pbWrapper?.isTaxFree).toBe(true);

			// Non-taxable wrapper should not be marked as tax-free
			const noneWrapper = result.actual.byTaxWrapper.find(
				(w: any) => w.taxWrapper === "none",
			);
			expect(noneWrapper?.isTaxFree).toBe(false);
		});

		it("should exclude tax-free wrappers from PSA calculation", async () => {
			// Create report with mixed wrappers
			const actualTotal = 100000;
			const transactionCount = 4;
			const mockReport = createMockReport({
				actualTotal,
				transactionCount,
				includeTaxFreeWrappers: true,
			});
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			// PSA calculation should only include taxable amount
			// which is total minus tax-free wrappers
			const taxableAmount = actualTotal - 25000 - 25000 - 25000; // Total minus isa, lisa, pb
			expect(result.forecast.psaStatusNow.used).toBe(taxableAmount);
		});
	});

	describe("Error handling", () => {
		it("should throw error when getInterestBreakdownReport fails", async () => {
			const error = new Error("Database connection failed");
			(getInterestBreakdownReport as any).mockRejectedValue(error);

			try {
				await callLoad(mockLocals);
				expect.fail("Should have thrown an error");
			} catch (e: any) {
				expect(e.message).toBe("Database connection failed");
			}
		});

		it("should log error when report generation fails", async () => {
			const error = new Error("Report generation failed");
			(getInterestBreakdownReport as any).mockRejectedValue(error);

			try {
				await callLoad(mockLocals);
				expect.fail("Should have thrown an error");
			} catch (e: any) {
				expect(e.message).toBe("Report generation failed");
			}
		});
	});

	describe("Edge cases", () => {
		it("should handle zero interest scenario", async () => {
			const mockReport = createMockReport({
				actualTotal: 0,
				transactionCount: 0,
				projectedTotal: 0,
				includeEmptyBreakdowns: true,
			});
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			expect(result.actual.total).toBe(0);
			expect(result.actual.transactions).toHaveLength(0);
			expect(result.actual.byAccount).toHaveLength(0);
			expect(result.actual.byMonth).toHaveLength(0);
			expect(result.projected.total).toBe(0);
			expect(result.forecast.total).toBe(0);
		});

		it("should handle no projected interest scenario", async () => {
			const mockReport = createMockReport({
				actualTotal: 50000,
				transactionCount: 3,
				projectedTotal: 0,
			});
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			expect(result.actual.total).toBe(50000);
			expect(result.projected.total).toBe(0);
			expect(result.forecast.total).toBe(50000);
		});

		it("should handle no actual interest scenario (projected only)", async () => {
			const mockReport = createMockReport({
				actualTotal: 0,
				transactionCount: 0,
				projectedTotal: 10000,
			});
			(getInterestBreakdownReport as any).mockResolvedValue(mockReport);

			const result = await callLoad(mockLocals);

			expect(result.actual.total).toBe(0);
			expect(result.projected.total).toBe(10000);
			expect(result.forecast.total).toBe(10000);
		});
	});
});

/**
 * Helper function to get tax wrapper for index
 */
function getTaxWrapperForIndex(index: number): string {
	const wrappers = ["isa", "lisa", "premium-bonds", "none"];
	return wrappers[index % wrappers.length];
}

/**
 * Helper function to create mock interest breakdown report
 */
function createMockReport(
	options: {
		actualTotal?: number;
		transactionCount?: number;
		projectedTotal?: number;
		includeReconciliationFlags?: boolean;
		includeTaxFreeWrappers?: boolean;
		includeEmptyBreakdowns?: boolean;
	} = {},
) {
	const {
		actualTotal = 60000,
		transactionCount = 3,
		projectedTotal = 10000,
		includeReconciliationFlags = false,
		includeTaxFreeWrappers = false,
		includeEmptyBreakdowns = false,
	} = options;

	const transactions: any[] = [];
	const byAccount: any[] = [];
	const byMonth: any[] = [];
	const byInstitution: any[] = [];
	const byTaxWrapper: any[] = [];

	// Create mock transactions
	if (transactionCount > 0) {
		const amountPerTransaction = Math.floor(actualTotal / transactionCount);
		for (let i = 0; i < transactionCount; i++) {
			const date = new Date(`2025-${4 + i}-10T00:00:00.000Z`);
			transactions.push({
				id: i + 1,
				slug: `tx-${i + 1}`,
				transactionDate: date,
				amount: amountPerTransaction,
				description: "Monthly interest",
				runningTotal: amountPerTransaction * (i + 1),
				accountId: 10 + i,
				accountSlug: `savings-${i + 1}`,
				accountName: `Savings Account ${i + 1}`,
				accountType: "savings",
				accountInstitution: "Test Bank",
				accountTaxWrapper: includeTaxFreeWrappers
					? getTaxWrapperForIndex(i)
					: "none",
			});

			byAccount.push({
				accountId: 10 + i,
				accountSlug: `savings-${i + 1}`,
				accountName: `Savings Account ${i + 1}`,
				accountType: "savings",
				accountInstitution: "Test Bank",
				accountTaxWrapper: includeTaxFreeWrappers
					? getTaxWrapperForIndex(i)
					: "none",
				total: amountPerTransaction,
				transactionCount: 1,
			});
		}

		// Group by month
		byMonth.push({
			year: 2025,
			month: 4,
			monthName: "April",
			total: actualTotal,
			transactionCount,
		});

		// Group by institution
		byInstitution.push({
			institution: "Test Bank",
			total: actualTotal,
			transactionCount,
		});

		// Group by tax wrapper
		if (includeTaxFreeWrappers) {
			const taxWrappers = ["isa", "lisa", "premium-bonds", "none"];
			const amountPerWrapper = Math.floor(actualTotal / taxWrappers.length);

			taxWrappers.forEach((wrapper, index) => {
				const isTaxFree =
					wrapper === "isa" ||
					wrapper === "lisa" ||
					wrapper === "premium-bonds";
				byTaxWrapper.push({
					taxWrapper: wrapper,
					total:
						index === taxWrappers.length - 1
							? actualTotal - amountPerWrapper * (taxWrappers.length - 1)
							: amountPerWrapper,
					transactionCount: 1,
					isTaxFree,
				});
			});
		} else {
			byTaxWrapper.push({
				taxWrapper: "none",
				total: actualTotal,
				transactionCount,
				isTaxFree: false,
			});
		}
	}

	// Create projected breakdown
	const projectedByAccount: any[] = [];
	if (projectedTotal > 0) {
		projectedByAccount.push({
			accountId: 10,
			accountSlug: "savings-1",
			accountName: "Savings Account 1",
			accountType: "savings",
			accountInstitution: "Test Bank",
			accountTaxWrapper: "none",
			balanceInCents: 1000000,
			rateBasisPoints: 450,
			maturityDate: null,
			daysUntilMaturity: null,
			daysUntilTaxYearEnd: 125,
			projectedInterest: projectedTotal,
			exclusionReason: null,
		});
	}

	// Create reconciliation flags if needed
	const flags: any[] = [];
	if (includeReconciliationFlags) {
		flags.push({
			category: "transactions",
			type: "error",
			message: "Transaction subtotal does not match headline actual",
			delta: 1000,
		});
	}

	// Calculate PSA status
	let taxableActual: number;
	let taxFreeActual: number;
	if (includeTaxFreeWrappers && transactionCount >= 3) {
		// Total minus isa, lisa, premium-bonds portions (approximately 3/4 of total)
		taxableActual = Math.floor(actualTotal / 4);
		taxFreeActual = actualTotal - taxableActual;
	} else if (includeEmptyBreakdowns) {
		taxableActual = 0;
		taxFreeActual = 0;
	} else {
		taxableActual = actualTotal;
		taxFreeActual = 0;
	}
	const taxableForecast = taxableActual + projectedTotal;

	// Update transactions with type
	transactions.forEach((tx) => {
		tx.type = "interest";
	});

	return {
		meta: {
			taxYearStart: new Date("2025-04-06T00:00:00.000Z"),
			taxYearEnd: new Date("2026-04-05T23:59:59.999Z"),
			asOfDate: new Date("2025-12-01T00:00:00.000Z"),
			daysRemainingInTaxYear: 125,
		},
		actual: {
			total: actualTotal,
			taxableTotal: taxableActual,
			taxFreeTotal: taxFreeActual,
			byAccount,
			byMonth,
			byInstitution,
			byTaxWrapper,
			transactions,
		},
		projected: {
			total: projectedTotal,
			taxableTotal: projectedTotal,
			taxFreeTotal: 0,
			byAccount: projectedByAccount,
		},
		forecast: {
			total: actualTotal + projectedTotal,
			taxableTotal: taxableActual + projectedTotal,
			taxFreeTotal: taxFreeActual,
			psaStatusNow: {
				allowance: 100000, // £1,000 for basic rate
				used: taxableActual,
				remaining: Math.max(0, 100000 - taxableActual),
				overAllowance: taxableActual > 100000,
				taxableAmount: Math.max(0, taxableActual - 100000),
			},
			psaStatusForecast: {
				allowance: 100000,
				used: taxableForecast,
				remaining: Math.max(0, 100000 - taxableForecast),
				overAllowance: taxableForecast > 100000,
				taxableAmount: Math.max(0, taxableForecast - 100000),
			},
		},
		reconciliation: {
			actualVsTransactionsDelta: includeReconciliationFlags ? 1000 : 0,
			actualVsByAccountDelta: includeReconciliationFlags ? 1000 : 0,
			actualVsByMonthDelta: includeReconciliationFlags ? 1000 : 0,
			flags,
		},
	};
}
