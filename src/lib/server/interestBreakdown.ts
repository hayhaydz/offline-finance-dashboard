/**
 * Interest Breakdown Module
 *
 * Provides traceable, auditable interest reporting for UK tax years.
 * All calculations are reconcilable from raw transactions with clear rules.
 *
 * UK tax year: 6 April to 5 April (inclusive)
 */

import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accountTransactions, accounts } from "$lib/db/schema";
import { withUserFilter } from "$lib/auth/row-security";
import { devLog, logError } from "$lib/utils/logger";
import { getCurrentBalanceForAccount } from "$lib/server/derivedBalances";
import { getCurrentRate } from "$lib/server/interestRates";
import {
	calculateProjectedInterestInCents,
	getAccountInterestEarned,
	getActualInterestEarned,
	getUkTaxYearBounds,
	getTaxFreeStatus,
	type TaxFreeStatus,
	type TaxBand,
} from "$lib/server/calculations";

/**
 * Interest transaction with account details for traceability
 */
export interface InterestTransaction {
	id: number;
	slug: string;
	transactionDate: Date;
	type: string; // 'interest' or 'interest_accrued' or 'opening'
	amount: number; // in cents
	description: string | null;
	runningTotal: number; // cumulative total in cents

	// Account details
	accountId: number;
	accountSlug: string;
	accountName: string;
	accountType: string;
	accountInstitution: string | null;
	accountTaxWrapper: string;
}

/**
 * Account breakdown with interest totals
 */
export interface AccountBreakdown {
	accountId: number;
	accountSlug: string;
	accountName: string;
	accountType: string;
	accountInstitution: string | null;
	accountTaxWrapper: string;
	total: number; // in cents
	transactionCount: number;
}

/**
 * Monthly breakdown of interest
 */
export interface MonthBreakdown {
	year: number;
	month: number; // 1-12
	monthName: string; // e.g., "April"
	total: number; // in cents
	transactionCount: number;
}

/**
 * Institution breakdown of interest
 */
export interface InstitutionBreakdown {
	institution: string;
	total: number; // in cents
	transactionCount: number;
}

/**
 * Tax wrapper breakdown of interest
 */
export interface TaxWrapperBreakdown {
	taxWrapper: string;
	total: number; // in cents
	transactionCount: number;
	isTaxFree: boolean;
}

/**
 * Actual interest breakdown with all dimensions
 */
export interface ActualInterestBreakdown {
	total: number; // in cents
	taxableTotal: number; // in cents
	taxFreeTotal: number; // in cents
	byAccount: AccountBreakdown[];
	byMonth: MonthBreakdown[];
	byInstitution: InstitutionBreakdown[];
	byTaxWrapper: TaxWrapperBreakdown[];
	transactions: InterestTransaction[];
}

/**
 * Projected interest per-account with assumptions
 */
export interface ProjectedAccountBreakdown {
	accountId: number;
	accountSlug: string;
	accountName: string;
	accountType: string;
	accountInstitution: string | null;
	accountTaxWrapper: string;

	// Projection inputs
	balanceInCents: number;
	rateBasisPoints: number | null;
	maturityDate: Date | null;
	daysUntilMaturity: number | null;
	daysUntilTaxYearEnd: number;

	// Calculated projection
	projectedInterest: number; // in cents

	// Exclusion reason (null if included)
	exclusionReason:
		| null
		| "no_balance"
		| "no_rate"
		| "already_matured"
		| "matures_after_tax_year"
		| "closed_account"
		| "non_interest_bearing";
}

/**
 * Projected interest breakdown for remaining tax year
 */
export interface ProjectedInterestBreakdown {
	total: number; // in cents
	taxableTotal: number; // in cents
	taxFreeTotal: number; // in cents
	byAccount: ProjectedAccountBreakdown[];
}

/**
 * Forecast combining actual and projected interest
 */
export interface InterestForecast {
	total: number; // in cents (actual + projected)
	taxableTotal: number; // in cents
	taxFreeTotal: number; // in cents
	psaStatusNow: TaxFreeStatus; // Personal Savings Allowance status (actual only)
	psaStatusForecast: TaxFreeStatus; // PSA status (actual + projected)
}

/**
 * Reconciliation flags for data validation
 */
export interface ReconciliationFlag {
	type: "warning" | "error";
	category: "transactions" | "by_account" | "by_month";
	message: string;
	delta?: number; // difference in cents
}

/**
 * Reconciliation report for validation
 */
export interface InterestReconciliationReport {
	actualVsTransactionsDelta: number; // should be 0
	actualVsByAccountDelta: number; // should be 0
	actualVsByMonthDelta: number; // should be 0
	flags: ReconciliationFlag[];
}

/**
 * Meta information about the request
 */
export interface InterestBreakdownMeta {
	taxYearStart: Date;
	taxYearEnd: Date;
	asOfDate: Date | null; // null if not provided
	daysRemainingInTaxYear: number;
}

/**
 * Complete interest breakdown payload
 */
export interface InterestBreakdownReport {
	meta: InterestBreakdownMeta;
	actual: ActualInterestBreakdown;
	projected: ProjectedInterestBreakdown;
	forecast: InterestForecast;
	reconciliation: InterestReconciliationReport;
}

/**
 * Check if a tax wrapper is tax-free (excluded from Personal Savings Allowance)
 */
function isTaxFree(taxWrapper: string): boolean {
	return taxWrapper === "isa" || taxWrapper === "lisa" || taxWrapper === "premium-bonds";
}

/**
 * Get month name from month number (1-12)
 */
function getMonthName(month: number): string {
	const names = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	return names[month - 1] || "Unknown";
}

/**
 * Fetch all interest transactions for the user in the tax year with account details.
 * Results are ordered by date ascending for running total calculation.
 *
 * @param userId - User ID from session
 * @param taxYearStart - Start of tax year (6 April)
 * @param taxYearEnd - End of tax year (5 April)
 * @returns Array of interest transactions with account details
 */
export async function getInterestTransactions(
	userId: number,
	taxYearStart: Date,
	taxYearEnd: Date,
): Promise<InterestTransaction[]> {
	devLog("getInterestTransactions", "Fetching interest transactions", {
		userId,
		taxYearStart,
		taxYearEnd,
	});

	// Get all user accounts first to create opening balance rows
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(userId, accounts),
	});

	const transactions = await db
		.select({
			id: accountTransactions.id,
			slug: accountTransactions.slug,
			transactionDate: accountTransactions.transactionDate,
			type: accountTransactions.type,
			amount: accountTransactions.amount,
			description: accountTransactions.description,
			accountId: accountTransactions.accountId,
			accountSlug: accounts.slug,
			accountName: accounts.name,
			accountType: accounts.type,
			accountInstitution: accounts.institution,
			accountTaxWrapper: accounts.taxWrapper,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(
			and(
				eq(accounts.userId, userId),
				inArray(accountTransactions.type, ["interest", "interest_accrued"]),
				gte(accountTransactions.transactionDate, taxYearStart),
				lte(accountTransactions.transactionDate, taxYearEnd),
			),
		)
		.orderBy(asc(accountTransactions.transactionDate), asc(accountTransactions.id));

	// Initialize result with opening balance rows for each account that is a savings/investment account
	const result: InterestTransaction[] = [];

	for (const account of userAccounts) {
		if (account.type === "savings" || account.type === "investment") {
			result.push({
				id: -account.id, // Synthetic ID
				slug: `opening-${account.slug}`,
				transactionDate: taxYearStart,
				type: "opening",
				amount: 0,
				description: "Opening Balance @ 06 APR",
				runningTotal: 0,
				accountId: account.id,
				accountSlug: account.slug,
				accountName: account.name,
				accountType: account.type,
				accountInstitution: account.institution,
				accountTaxWrapper: account.taxWrapper,
			});
		}
	}

	// Calculate running total
	let runningTotal = 0;
	// Sort transactions to ensure correct running total calculation
	const sortedTransactions = [...transactions].sort(
		(a, b) => a.transactionDate.getTime() - b.transactionDate.getTime() || a.id - b.id
	);

	for (const tx of sortedTransactions) {
		runningTotal += tx.amount;
		result.push({
			id: tx.id,
			slug: tx.slug,
			transactionDate: tx.transactionDate,
			type: tx.type,
			amount: tx.amount,
			description: tx.description,
			runningTotal,
			accountId: tx.accountId,
			accountSlug: tx.accountSlug,
			accountName: tx.accountName,
			accountType: tx.accountType,
			accountInstitution: tx.accountInstitution,
			accountTaxWrapper: tx.accountTaxWrapper,
		});
	}

	// Final sort to ensure opening balances stay at the top for each date
	result.sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime() || a.id - b.id);

	devLog("getInterestTransactions", "Fetched transactions", {
		count: result.length,
		total: runningTotal,
	});

	return result;
}

/**
 * Calculate actual interest totals with breakdowns by multiple dimensions.
 *
 * @param userId - User ID from session
 * @param taxYearStart - Start of tax year (6 April)
 * @param taxYearEnd - End of tax year (5 April)
 * @returns Complete actual interest breakdown
 */
export async function getActualInterestBreakdown(
	userId: number,
	taxYearStart: Date,
	taxYearEnd: Date,
): Promise<ActualInterestBreakdown> {
	devLog("getActualInterestBreakdown", "Calculating actual interest breakdown", {
		userId,
		taxYearStart,
		taxYearEnd,
	});

	// Get transactions with running totals (includes interest and interest_accrued)
	const transactions = await getInterestTransactions(userId, taxYearStart, taxYearEnd);

	// Get user accounts to check maturity dates
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(userId, accounts),
	});
	const accountMapForMaturity = new Map(userAccounts.map(a => [a.id, a]));

	// Get headline total from summary query (source of truth for comparison)
	const total = await getActualInterestEarned(userId, taxYearStart, taxYearEnd);
	
	let taxableTotal = 0;
	let taxFreeTotal = 0;

	// Break down by account
	const accountMap = new Map<number, AccountBreakdown>();
	for (const tx of transactions) {
		// Only count real interest transactions (not synthetic opening balances) for the total
		if (tx.type === "opening") continue;

		const account = accountMapForMaturity.get(tx.accountId);
		const isAccrued = tx.type === "interest_accrued";
		
		// Logic:
		// 1. ISA/LISA/Premium Bonds are always tax-free
		// 2. Accrued interest on non-matured bonds is EXCLUDED from taxable actuals for THIS year
		// 3. Everything else is taxable (unless it's tax-free wrapper)

		const isTaxFreeWrapper = isTaxFree(tx.accountTaxWrapper);
		
		let countsAsActualThisYear = true;
		// If it's accrued interest and the account has a maturity date in the future
		if (account?.maturityDate && account.maturityDate > taxYearEnd && isAccrued) {
			countsAsActualThisYear = false;
		}

		if (countsAsActualThisYear) {
			if (isTaxFreeWrapper) {
				taxFreeTotal += tx.amount;
			} else {
				taxableTotal += tx.amount;
			}
		}

		const existing = accountMap.get(tx.accountId);
		if (existing) {
			existing.total += tx.amount;
			existing.transactionCount += 1;
		} else {
			accountMap.set(tx.accountId, {
				accountId: tx.accountId,
				accountSlug: tx.accountSlug,
				accountName: tx.accountName,
				accountType: tx.accountType,
				accountInstitution: tx.accountInstitution,
				accountTaxWrapper: tx.accountTaxWrapper,
				total: tx.amount,
				transactionCount: 1,
			});
		}
	}
	const byAccount = Array.from(accountMap.values()).sort(
		(a, b) => b.total - a.total,
	);

	// Break down by month
	const monthMap = new Map<string, MonthBreakdown>();
	for (const tx of transactions) {
		if (tx.type === "opening") continue;
		const year = tx.transactionDate.getUTCFullYear();
		const month = tx.transactionDate.getUTCMonth() + 1; // 1-12
		const key = `${year}-${month}`;

		const existing = monthMap.get(key);
		if (existing) {
			existing.total += tx.amount;
			existing.transactionCount += 1;
		} else {
			monthMap.set(key, {
				year,
				month,
				monthName: getMonthName(month),
				total: tx.amount,
				transactionCount: 1,
			});
		}
	}
	const byMonth = Array.from(monthMap.values()).sort((a, b) => {
		if (a.year !== b.year) return a.year - b.year;
		return a.month - b.month;
	});

	// Break down by institution
	const institutionMap = new Map<string, InstitutionBreakdown>();
	for (const tx of transactions) {
		if (tx.type === "opening") continue;
		const institution = tx.accountInstitution || "Unknown";
		const existing = institutionMap.get(institution);
		if (existing) {
			existing.total += tx.amount;
			existing.transactionCount += 1;
		} else {
			institutionMap.set(institution, {
				institution,
				total: tx.amount,
				transactionCount: 1,
			});
		}
	}
	const byInstitution = Array.from(institutionMap.values()).sort(
		(a, b) => b.total - a.total,
	);

	// Break down by tax wrapper
	const wrapperMap = new Map<string, TaxWrapperBreakdown>();
	for (const tx of transactions) {
		if (tx.type === "opening") continue;
		const existing = wrapperMap.get(tx.accountTaxWrapper);
		if (existing) {
			existing.total += tx.amount;
			existing.transactionCount += 1;
		} else {
			wrapperMap.set(tx.accountTaxWrapper, {
				taxWrapper: tx.accountTaxWrapper,
				total: tx.amount,
				transactionCount: 1,
				isTaxFree: isTaxFree(tx.accountTaxWrapper),
			});
		}
	}
	const byTaxWrapper = Array.from(wrapperMap.values()).sort(
		(a, b) => b.total - a.total,
	);

	devLog("getActualInterestBreakdown", "Calculated breakdown", {
		total,
		taxableTotal,
		taxFreeTotal,
		transactionCount: transactions.length - userAccounts.length, // excluding opening balances
		accountCount: byAccount.length,
	});

	return {
		total,
		taxableTotal,
		taxFreeTotal,
		byAccount,
		byMonth,
		byInstitution,
		byTaxWrapper,
		transactions,
	};
}

/**
 * Calculate projected interest for remaining tax year with per-account assumptions.
 * Handles fixed-term payout: if maturity > tax-year end, projected = 0.
 *
 * @param userId - User ID from session
 * @param taxYearStart - Start of tax year (6 April)
 * @param taxYearEnd - End of tax year (5 April)
 * @param asOfDate - Reference date for projections (default: now)
 * @returns Projected interest breakdown with assumptions
 */
export async function getProjectedInterestBreakdown(
	userId: number,
	taxYearStart: Date,
	taxYearEnd: Date,
	asOfDate?: Date,
): Promise<ProjectedInterestBreakdown> {
	const now = asOfDate ?? new Date();
	devLog("getProjectedInterestBreakdown", "Calculating projected interest", {
		userId,
		taxYearStart,
		taxYearEnd,
		asOfDate: now,
	});

	// Calculate days remaining in tax year
	const msPerDay = 24 * 60 * 60 * 1000;
	const daysRemainingInTaxYear = Math.max(
		0,
		Math.ceil((taxYearEnd.getTime() - now.getTime()) / msPerDay),
	);

	if (daysRemainingInTaxYear === 0) {
		// Tax year has ended, no projections
		return { total: 0, taxableTotal: 0, taxFreeTotal: 0, byAccount: [] };
	}

	// Get all user accounts
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(userId, accounts),
	});

	// Calculate projection for each account
	const byAccount: ProjectedAccountBreakdown[] = [];
	let total = 0;
	let taxableTotal = 0;
	let taxFreeTotal = 0;

	for (const account of userAccounts) {
		const accountId = account.id;

		// Check if account is closed
		if (account.closedAt) {
			byAccount.push({
				accountId,
				accountSlug: account.slug,
				accountName: account.name,
				accountType: account.type,
				accountInstitution: account.institution,
				accountTaxWrapper: account.taxWrapper,
				balanceInCents: 0,
				rateBasisPoints: null,
				maturityDate: account.maturityDate,
				daysUntilMaturity: null,
				daysUntilTaxYearEnd: daysRemainingInTaxYear,
				projectedInterest: 0,
				exclusionReason: "closed_account",
			});
			continue;
		}

		// Check if account type is interest-bearing
		if (account.type !== "savings" && account.type !== "investment") {
			byAccount.push({
				accountId,
				accountSlug: account.slug,
				accountName: account.name,
				accountType: account.type,
				accountInstitution: account.institution,
				accountTaxWrapper: account.taxWrapper,
				balanceInCents: 0,
				rateBasisPoints: null,
				maturityDate: account.maturityDate,
				daysUntilMaturity: null,
				daysUntilTaxYearEnd: daysRemainingInTaxYear,
				projectedInterest: 0,
				exclusionReason: "non_interest_bearing",
			});
			continue;
		}

		// Get current balance
		const currentBalance = await getCurrentBalanceForAccount(accountId);
		if (currentBalance <= 0) {
			byAccount.push({
				accountId,
				accountSlug: account.slug,
				accountName: account.name,
				accountType: account.type,
				accountInstitution: account.institution,
				accountTaxWrapper: account.taxWrapper,
				balanceInCents: currentBalance,
				rateBasisPoints: null,
				maturityDate: account.maturityDate,
				daysUntilMaturity: null,
				daysUntilTaxYearEnd: daysRemainingInTaxYear,
				projectedInterest: 0,
				exclusionReason: "no_balance",
			});
			continue;
		}

		// Get current rate
		const currentRate = await getCurrentRate(accountId);
		if (currentRate === null || currentRate === 0) {
			byAccount.push({
				accountId,
				accountSlug: account.slug,
				accountName: account.name,
				accountType: account.type,
				accountInstitution: account.institution,
				accountTaxWrapper: account.taxWrapper,
				balanceInCents: currentBalance,
				rateBasisPoints: currentRate,
				maturityDate: account.maturityDate,
				daysUntilMaturity: null,
				daysUntilTaxYearEnd: daysRemainingInTaxYear,
				projectedInterest: 0,
				exclusionReason: "no_rate",
			});
			continue;
		}

		// Handle fixed-term maturity
		let projected = 0;
		let exclusionReason: ProjectedAccountBreakdown["exclusionReason"] = null;
		let daysUntilMaturity: number | null = null;

		if (account.maturityDate) {
			// Fixed-term bond
			if (account.maturityDate > taxYearEnd) {
				// Matures after tax year end - no payout this tax year
				exclusionReason = "matures_after_tax_year";
				projected = 0;
			} else if (account.maturityDate <= now) {
				// Already matured
				exclusionReason = "already_matured";
				projected = 0;
			} else {
				// Matures within this tax year - project only until maturity
				daysUntilMaturity = Math.max(
					0,
					Math.ceil((account.maturityDate.getTime() - now.getTime()) / msPerDay),
				);
				projected = calculateProjectedInterestInCents({
					balanceInCents: currentBalance,
					rateBasisPoints: currentRate,
					fromDate: now,
					toDate: account.maturityDate,
				});
			}
		} else {
			// Standard access account - project until tax year end
			projected = calculateProjectedInterestInCents({
				balanceInCents: currentBalance,
				rateBasisPoints: currentRate,
				fromDate: now,
				toDate: taxYearEnd,
			});
		}

		byAccount.push({
			accountId,
			accountSlug: account.slug,
			accountName: account.name,
			accountType: account.type,
			accountInstitution: account.institution,
			accountTaxWrapper: account.taxWrapper,
			balanceInCents: currentBalance,
			rateBasisPoints: currentRate,
			maturityDate: account.maturityDate,
			daysUntilMaturity,
			daysUntilTaxYearEnd: daysRemainingInTaxYear,
			projectedInterest: projected,
			exclusionReason,
		});

		total += projected;
		if (isTaxFree(account.taxWrapper)) {
			taxFreeTotal += projected;
		} else {
			taxableTotal += projected;
		}
	}

	// Sort by projected amount descending
	byAccount.sort((a, b) => b.projectedInterest - a.projectedInterest);

	devLog("getProjectedInterestBreakdown", "Calculated projections", {
		total,
		taxableTotal,
		taxFreeTotal,
		accountCount: byAccount.length,
		daysRemainingInTaxYear,
	});

	return {
		total,
		taxableTotal,
		taxFreeTotal,
		byAccount,
	};
}

/**
 * Generate reconciliation report to validate data integrity.
 * Checks that breakdowns sum to headline totals and flags any discrepancies.
 *
 * @param userId - User ID from session
 * @param taxYearStart - Start of tax year (6 April)
 * @param taxYearEnd - End of tax year (5 April)
 * @param asOfDate - Reference date for projections (default: now)
 * @returns Reconciliation report with validation results
 */
export async function getInterestReconciliationReport(
	userId: number,
	taxYearStart: Date,
	taxYearEnd: Date,
	asOfDate?: Date,
): Promise<InterestReconciliationReport> {
	devLog("getInterestReconciliationReport", "Running reconciliation", {
		userId,
		taxYearStart,
		taxYearEnd,
		asOfDate,
	});

	const flags: ReconciliationFlag[] = [];

	// Get actual breakdown
	const actual = await getActualInterestBreakdown(userId, taxYearStart, taxYearEnd);

	// Check: transactions sum should equal total
	const transactionsSum = actual.transactions.reduce(
		(sum, tx) => sum + tx.amount,
		0,
	);
	const actualVsTransactionsDelta = actual.total - transactionsSum;

	if (actualVsTransactionsDelta !== 0) {
		flags.push({
			type: "error",
			category: "transactions",
			message: `Transaction sum (${centsToCurrency(transactionsSum)}) does not match headline total (${centsToCurrency(actual.total)})`,
			delta: actualVsTransactionsDelta,
		});
	}

	// Check: by-account sum should equal total
	const byAccountSum = actual.byAccount.reduce(
		(sum, acc) => sum + acc.total,
		0,
	);
	const actualVsByAccountDelta = actual.total - byAccountSum;

	if (actualVsByAccountDelta !== 0) {
		flags.push({
			type: "error",
			category: "by_account",
			message: `Account breakdown sum (${centsToCurrency(byAccountSum)}) does not match headline total (${centsToCurrency(actual.total)})`,
			delta: actualVsByAccountDelta,
		});
	}

	// Check: by-month sum should equal total
	const byMonthSum = actual.byMonth.reduce(
		(sum, month) => sum + month.total,
		0,
	);
	const actualVsByMonthDelta = actual.total - byMonthSum;

	if (actualVsByMonthDelta !== 0) {
		flags.push({
			type: "error",
			category: "by_month",
			message: `Monthly breakdown sum (${centsToCurrency(byMonthSum)}) does not match headline total (${centsToCurrency(actual.total)})`,
			delta: actualVsByMonthDelta,
		});
	}

	devLog("getInterestReconciliationReport", "Reconciliation complete", {
		actualVsTransactionsDelta,
		actualVsByAccountDelta,
		actualVsByMonthDelta,
		flagCount: flags.length,
	});

	return {
		actualVsTransactionsDelta,
		actualVsByAccountDelta,
		actualVsByMonthDelta,
		flags,
	};
}

/**
 * Get complete interest breakdown report.
 * Combines actual, projected, forecast, and reconciliation data.
 *
 * @param userId - User ID from session
 * @param taxYearStart - Start of tax year (6 April) (optional, will calculate if not provided)
 * @param taxYearEnd - End of tax year (5 April) (optional, will calculate if not provided)
 * @param asOfDate - Reference date for projections (default: now)
 * @param taxBand - User's tax band for PSA calculation (default: "basic")
 * @returns Complete interest breakdown report
 */
export async function getInterestBreakdownReport(params: {
	userId: number;
	taxYearStart?: Date;
	taxYearEnd?: Date;
	asOfDate?: Date;
	taxBand?: TaxBand;
}): Promise<InterestBreakdownReport> {
	const { userId, taxYearStart, taxYearEnd, asOfDate, taxBand = "basic" } = params;

	// Calculate tax year bounds if not provided
	const taxYear =
		taxYearStart && taxYearEnd
			? { start: taxYearStart, end: taxYearEnd }
			: getUkTaxYearBounds(asOfDate);

	const calculatedTaxYearStart = taxYear.start;
	const calculatedTaxYearEnd = taxYear.end;

	const now = asOfDate ?? new Date();

	// Calculate days remaining in tax year
	const msPerDay = 24 * 60 * 60 * 1000;
	const daysRemainingInTaxYear = Math.max(
		0,
		Math.ceil((calculatedTaxYearEnd.getTime() - now.getTime()) / msPerDay),
	);

	devLog("getInterestBreakdownReport", "Generating complete report", {
		userId,
		taxYearStart: calculatedTaxYearStart,
		taxYearEnd: calculatedTaxYearEnd,
		asOfDate: now,
		taxBand,
		daysRemainingInTaxYear,
	});

	// Get all breakdowns in parallel
	const [actual, projected, reconciliation] = await Promise.all([
		getActualInterestBreakdown(userId, calculatedTaxYearStart, calculatedTaxYearEnd),
		getProjectedInterestBreakdown(
			userId,
			calculatedTaxYearStart,
			calculatedTaxYearEnd,
			now,
		),
		getInterestReconciliationReport(
			userId,
			calculatedTaxYearStart,
			calculatedTaxYearEnd,
			now,
		),
	]);

	// Calculate forecast totals
	const total = actual.total + projected.total;
	const taxableTotal = actual.taxableTotal + projected.taxableTotal;
	const taxFreeTotal = actual.taxFreeTotal + projected.taxFreeTotal;

	// Calculate PSA status
	const psaStatusNow = getTaxFreeStatus(actual.taxableTotal, taxBand);
	const psaStatusForecast = getTaxFreeStatus(taxableTotal, taxBand);

	const meta: InterestBreakdownMeta = {
		taxYearStart: calculatedTaxYearStart,
		taxYearEnd: calculatedTaxYearEnd,
		asOfDate: now,
		daysRemainingInTaxYear,
	};

	const forecast: InterestForecast = {
		total,
		taxableTotal,
		taxFreeTotal,
		psaStatusNow,
		psaStatusForecast,
	};

	devLog("getInterestBreakdownReport", "Report generated", {
		actualTotal: actual.total,
		projectedTotal: projected.total,
		forecastTotal: total,
		taxableTotal,
		taxFreeTotal,
		flagCount: reconciliation.flags.length,
	});

	return {
		meta,
		actual,
		projected,
		forecast,
		reconciliation,
	};
}

/**
 * Helper: Convert cents to currency string (internal utility)
 */
function centsToCurrency(cents: number): string {
	return `£${(cents / 100).toFixed(2)}`;
}
