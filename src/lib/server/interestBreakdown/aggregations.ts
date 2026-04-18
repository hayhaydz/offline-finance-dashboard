/**
 * Interest Breakdown — Aggregations
 *
 * Actual interest breakdown by account/month/institution/wrapper,
 * projected interest per-account, and projection eligibility logic.
 */

import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts } from "$lib/db/schema";
import { getActualInterestEarned } from "$lib/server/tax-year-queries";
import {
	calculateProjectedInterestInCents,
	getUkTaxYearBounds,
} from "$lib/utils/tax-year-utils";
import {
	getCurrentBalanceForAccount,
	getCurrentBalancesForAccounts,
} from "$lib/server/derivedBalances";
import {
	getCurrentRate,
	getCurrentRatesForAccounts,
} from "$lib/server/interestRates";
import { getMonthName } from "$lib/utils/formatting";
import { isTaxFreeWrapper } from "$lib/utils/tax-classification";
import { devLog, isVerboseDebug } from "$lib/server/logger";
import { MS_PER_DAY } from "$lib/utils/time-constants";

import type {
	AccountBreakdown,
	MonthBreakdown,
	InstitutionBreakdown,
	TaxWrapperBreakdown,
	ActualInterestBreakdown,
	ProjectedAccountBreakdown,
	ProjectedInterestBreakdown,
} from "$lib/types/breakdown";

import { getInterestTransactions } from "./queries";

/**
 * Check if an account qualifies for interest projections.
 * Returns eligibility status and exclusion reason if not eligible.
 *
 * Exported for use by index.ts (getAccountInterestSummary).
 */
export function checkProjectionEligibility(
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
	if (isVerboseDebug()) {
		devLog("getProjectedInterestBreakdown", "Calculating projected interest", {
			userId,
			taxYearStart,
			taxYearEnd,
			asOfDate: now,
		});
	}

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



	return {
		total,
		taxableTotal,
		taxFreeTotal,
		byAccount,
	};
}
