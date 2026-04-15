/**
 * Interest Breakdown Module
 *
 * Provides traceable, auditable interest reporting for UK tax years.
 * All calculations are reconcilable from raw transactions with clear rules.
 *
 * UK tax year: 6 April to 5 April (inclusive)
 */

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, accountTransactions } from "$lib/db/schema";
import {
	getAccountInterestEarned,
	getActualInterestEarned,
} from "$lib/server/tax-year-queries";
import {
	calculateProjectedInterestInCents,
	getTaxFreeStatus,
	getUkTaxYearBounds,
	type TaxBand,
	type TaxFreeStatus,
} from "$lib/utils/tax-year-utils";
import {
	getCurrentBalanceForAccount,
	getCurrentBalancesForAccounts,
} from "$lib/server/derivedBalances";
import {
	getCurrentRate,
	getCurrentRatesForAccounts,
} from "$lib/server/interestRates";
import { formatCurrency } from "$lib/utils/currency";
import { getMonthName } from "$lib/utils/formatting";
import { isTaxFreeWrapper } from "$lib/utils/tax-classification";
import { devLog, logError } from "$lib/server/logger";
import { MS_PER_DAY } from "$lib/utils/time-constants";

import type {
	InterestTransaction,
	AccountBreakdown,
	MonthBreakdown,
	InstitutionBreakdown,
	TaxWrapperBreakdown,
	ActualInterestBreakdown,
	ProjectedAccountBreakdown,
	ProjectedInterestBreakdown,
	InterestForecast,
	ReconciliationFlag,
	InterestReconciliationReport,
	InterestBreakdownMeta,
	InterestBreakdownReport,
	AccountInterestSummary,
} from "$lib/types/breakdown";

// Re-export types for backward compatibility
export type {
	InterestTransaction,
	AccountBreakdown,
	MonthBreakdown,
	InstitutionBreakdown,
	TaxWrapperBreakdown,
	ActualInterestBreakdown,
	ProjectedAccountBreakdown,
	ProjectedInterestBreakdown,
	InterestForecast,
	ReconciliationFlag,
	InterestReconciliationReport,
	InterestBreakdownMeta,
	InterestBreakdownReport,
	AccountInterestSummary,
};


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
		.orderBy(
			asc(accountTransactions.transactionDate),
			asc(accountTransactions.id),
		);

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
	for (const tx of transactions) {
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
	result.sort(
		(a, b) =>
			a.transactionDate.getTime() - b.transactionDate.getTime() || a.id - b.id,
	);

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
	devLog(
		"getActualInterestBreakdown",
		"Calculating actual interest breakdown",
		{
			userId,
			taxYearStart,
			taxYearEnd,
		},
	);

	// Get transactions with running totals (includes interest and interest_accrued)
	const transactions = await getInterestTransactions(
		userId,
		taxYearStart,
		taxYearEnd,
	);

	// Get user accounts to check maturity dates
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(userId, accounts),
	});
	const accountMapForMaturity = new Map(userAccounts.map((a) => [a.id, a]));

	// Filter out transactions from accounts that mature after the tax year
	const validTransactions = transactions.filter((tx) => {
		const account = accountMapForMaturity.get(tx.accountId);
		if (!account || !account.maturityDate) return true; // No maturity date = always valid
		return account.maturityDate <= taxYearEnd; // Only include if matures within tax year
	});

	// Get headline total from summary query (source of truth for comparison)
	const total = await getActualInterestEarned(userId, taxYearStart, taxYearEnd);

	let taxableTotal = 0;
	let taxFreeTotal = 0;

	// Break down by account
	const accountMap = new Map<number, AccountBreakdown>();
	for (const tx of validTransactions) {
		// Only count real interest transactions (not synthetic opening balances) for the total
		if (tx.type === "opening") continue;

		const account = accountMapForMaturity.get(tx.accountId);
		const isAccrued = tx.type === "interest_accrued";

		// Logic:
		// 1. ISA/LISA/Premium Bonds are always tax-free
		// 2. Accrued interest on non-matured bonds is EXCLUDED from taxable actuals for THIS year
		// 3. Everything else is taxable (unless it's tax-free wrapper)

		const isAccountTaxFree = isTaxFreeWrapper(tx.accountTaxWrapper);

		let countsAsActualThisYear = true;
		// If it's accrued interest and the account has a maturity date in the future
		if (
			account?.maturityDate &&
			account.maturityDate > taxYearEnd &&
			isAccrued
		) {
			countsAsActualThisYear = false;
		}

		if (countsAsActualThisYear) {
			if (isAccountTaxFree) {
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
	for (const tx of validTransactions) {
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
	for (const tx of validTransactions) {
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
	for (const tx of validTransactions) {
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
				isTaxFree: isTaxFreeWrapper(tx.accountTaxWrapper),
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
		transactions: validTransactions,
	};
}

/**
 * Check if an account qualifies for interest projections.
 * Returns eligibility status and exclusion reason if not eligible.
 *
 * @param account - Account to check
 * @param currentBalance - Current account balance in cents
 * @param currentRate - Current interest rate in basis points (null if none)
 * @param now - Reference date for calculations
 * @param taxYearEnd - End of tax year
 * @returns Eligibility status and exclusion reason
 */
function checkProjectionEligibility(
	account: {
		closedAt: Date | null;
		type: string;
		maturityDate: Date | null;
	},
	currentBalance: number,
	currentRate: number | null,
	now: Date,
	taxYearEnd: Date,
): {
	eligible: boolean;
	exclusionReason: ProjectedAccountBreakdown["exclusionReason"];
} {
	// Check if account is closed
	if (account.closedAt) {
		return { eligible: false, exclusionReason: "closed_account" };
	}

	// Check if account type is interest-bearing
	if (account.type !== "savings" && account.type !== "investment") {
		return { eligible: false, exclusionReason: "non_interest_bearing" };
	}

	// Check if account has balance
	if (currentBalance <= 0) {
		return { eligible: false, exclusionReason: "no_balance" };
	}

	// Check if account has a rate set
	if (currentRate === null || currentRate === 0) {
		return { eligible: false, exclusionReason: "no_rate" };
	}

	// Handle fixed-term maturity checks
	if (account.maturityDate) {
		if (account.maturityDate > taxYearEnd) {
			// Matures after tax year end - no payout this tax year
			return { eligible: false, exclusionReason: "matures_after_tax_year" };
		}
		if (account.maturityDate <= now) {
			// Already matured
			return { eligible: false, exclusionReason: "already_matured" };
		}
	}

	// All checks passed
	return { eligible: true, exclusionReason: null };
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
	const msPerDay = MS_PER_DAY;
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
	const accountIds = userAccounts.map((account) => account.id);

	const [balancesByAccount, ratesByAccount] = await Promise.all([
		getCurrentBalancesForAccounts(accountIds),
		getCurrentRatesForAccounts(accountIds, now),
	]);

	// Calculate projection for each account
	const byAccount: ProjectedAccountBreakdown[] = [];
	let total = 0;
	let taxableTotal = 0;
	let taxFreeTotal = 0;

	for (const account of userAccounts) {
		const accountId = account.id;
		const currentBalance = balancesByAccount.get(accountId) ?? 0;
		const currentRate = ratesByAccount.get(accountId) ?? null;
		const rateBasisPoints = currentRate ?? 0;

		const { eligible, exclusionReason } = checkProjectionEligibility(
			account,
			currentBalance,
			currentRate,
			now,
			taxYearEnd,
		);

		// Handle fixed-term maturity
		let projected = 0;
		let daysUntilMaturity: number | null = null;

		if (eligible) {
			if (account.maturityDate) {
				// Fixed-term bond - project only until maturity
				daysUntilMaturity = Math.max(
					0,
					Math.ceil(
						(account.maturityDate.getTime() - now.getTime()) / msPerDay,
					),
				);
				projected = calculateProjectedInterestInCents({
					balanceInCents: currentBalance,
					rateBasisPoints,
					fromDate: now,
					toDate: account.maturityDate,
				});
			} else {
				// Standard access account - project until tax year end
				projected = calculateProjectedInterestInCents({
					balanceInCents: currentBalance,
					rateBasisPoints,
					fromDate: now,
					toDate: taxYearEnd,
				});
			}
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
		if (isTaxFreeWrapper(account.taxWrapper)) {
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
	const actual = await getActualInterestBreakdown(
		userId,
		taxYearStart,
		taxYearEnd,
	);

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
			message: `Transaction sum (${formatCurrency(transactionsSum)}) does not match headline total (${formatCurrency(actual.total)})`,
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
			message: `Account breakdown sum (${formatCurrency(byAccountSum)}) does not match headline total (${formatCurrency(actual.total)})`,
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
			message: `Monthly breakdown sum (${formatCurrency(byMonthSum)}) does not match headline total (${formatCurrency(actual.total)})`,
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
	const {
		userId,
		taxYearStart,
		taxYearEnd,
		asOfDate,
		taxBand = "basic",
	} = params;

	// Calculate tax year bounds if not provided
	const taxYear =
		taxYearStart && taxYearEnd
			? { start: taxYearStart, end: taxYearEnd }
			: getUkTaxYearBounds(asOfDate);

	const calculatedTaxYearStart = taxYear.start;
	const calculatedTaxYearEnd = taxYear.end;

	const now = asOfDate ?? new Date();

	// Calculate days remaining in tax year
	const msPerDay = MS_PER_DAY;
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
		getActualInterestBreakdown(
			userId,
			calculatedTaxYearStart,
			calculatedTaxYearEnd,
		),
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
 * Get interest summary for a single account with projection eligibility.
 * Reuses the same eligibility logic as multi-account breakdown for consistency.
 *
 * @param params - Account ID, tax year bounds, and optional parameters
 * @returns Account interest summary or null if account is not interest-bearing type
 */
export async function getAccountInterestSummary(params: {
	accountId: number;
	taxYearStart: Date;
	taxYearEnd: Date;
	asOfDate?: Date;
	taxBand?: TaxBand;
}): Promise<AccountInterestSummary | null> {
	const {
		accountId,
		taxYearStart,
		taxYearEnd,
		asOfDate,
		taxBand = "basic",
	} = params;

	devLog("getAccountInterestSummary", "Fetching account interest summary", {
		accountId,
		taxYearStart,
		taxYearEnd,
	});

	// Get the account
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.id, accountId),
	});

	if (!account) {
		logError("getAccountInterestSummary", "Account not found", { accountId });
		return null;
	}

	// Return null for non-interest-bearing account types
	if (account.type !== "savings" && account.type !== "investment") {
		devLog(
			"getAccountInterestSummary",
			"Account is not interest-bearing type",
			{
				accountId,
				accountType: account.type,
			},
		);
		return null;
	}

	const now = asOfDate ?? new Date();

	// Get actual interest earned (use the single-account query)
	const actualInterest = await getAccountInterestEarned(
		accountId,
		taxYearStart,
		taxYearEnd,
	);

	// Get current balance and rate for eligibility check
	const [currentBalance, currentRate] = await Promise.all([
		getCurrentBalanceForAccount(accountId),
		getCurrentRate(accountId),
	]);

	// Check projection eligibility using the same logic as multi-account breakdown
	const { eligible, exclusionReason } = checkProjectionEligibility(
		account,
		currentBalance,
		currentRate,
		now,
		taxYearEnd,
	);

	let projectedInterest = 0;
	const rateBasisPoints = currentRate ?? 0;

	if (eligible) {
		// Calculate projection using the same formula as multi-account breakdown
		if (account.maturityDate) {
			// Fixed-term bond - project only until maturity
			projectedInterest = calculateProjectedInterestInCents({
				balanceInCents: currentBalance,
				rateBasisPoints,
				fromDate: now,
				toDate: account.maturityDate,
			});
		} else {
			// Standard access account - project until tax year end
			projectedInterest = calculateProjectedInterestInCents({
				balanceInCents: currentBalance,
				rateBasisPoints,
				fromDate: now,
				toDate: taxYearEnd,
			});
		}
	}

	// Get tax-free status for actual interest
	const taxFreeStatus = getTaxFreeStatus(actualInterest, taxBand);

	const totalExpectedInterest = actualInterest + projectedInterest;

	const summary: AccountInterestSummary = {
		actualInterest,
		projectedInterest,
		totalExpectedInterest,
		projectionExclusionReason: exclusionReason,
		taxYearStart,
		taxYearEnd,
		taxFreeStatus,
	};

	devLog("getAccountInterestSummary", "Summary calculated", {
		accountId,
		actualInterest,
		projectedInterest,
		totalExpectedInterest,
		exclusionReason: exclusionReason,
	});

	return summary;
}

