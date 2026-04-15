/**
 * Interest Breakdown Module — Public API
 *
 * Orchestrates queries, aggregations, and reconciliation to provide
 * complete interest reporting for UK tax years.
 *
 * All public functions + types are re-exported for backward compatibility
 * with consumers importing from `$lib/server/interestBreakdown`.
 */

import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accounts } from "$lib/db/schema";
import { getAccountInterestEarned } from "$lib/server/tax-year-queries";
import {
	calculateProjectedInterestInCents,
	getTaxFreeStatus,
	getUkTaxYearBounds,
	type TaxBand,
} from "$lib/utils/tax-year-utils";
import {
	getCurrentBalanceForAccount,
} from "$lib/server/derivedBalances";
import { getCurrentRate } from "$lib/server/interestRates";
import { devLog, logError } from "$lib/server/logger";
import { MS_PER_DAY } from "$lib/utils/time-constants";

import type {
	InterestBreakdownMeta,
	InterestBreakdownReport,
	InterestForecast,
	AccountInterestSummary,
	ProjectedAccountBreakdown,
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
} from "$lib/types/breakdown";

// Re-export public functions from sub-modules
export { getInterestTransactions } from "./queries";
export { getActualInterestBreakdown, getProjectedInterestBreakdown } from "./aggregations";
export { getInterestReconciliationReport } from "./reconciliation";

// Internal: import for orchestration (not re-exported)
import { getActualInterestBreakdown, getProjectedInterestBreakdown } from "./aggregations";
import { getInterestReconciliationReport } from "./reconciliation";
import { checkProjectionEligibility } from "./aggregations";

/**
 * Get complete interest breakdown report.
 * Combines actual, projected, forecast, and reconciliation data.
 *
 * @param params - User ID, optional tax year bounds, as-of date, and tax band
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
