import { eq, inArray } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, accountTransactions } from "$lib/db/schema";
import { getInterestBreakdownReport } from "$lib/server/interestBreakdown";
import { devLog, isVerboseDebug, logError } from "$lib/server/logger";
import { bandForTaxYear } from "$lib/server/tax-bands";
import { requireAuth } from "$lib/server/utils/auth-guard";
import {
	getPsaAllowanceInCents,
	getUkTaxYearBounds,
	previousTaxYear,
	taxYearLabelFromDate,
} from "$lib/utils/tax-year-utils";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireAuth(locals);

	const { year } = params;
	const taxYear = getUkTaxYearBounds(year);
	const canonicalYear = taxYearLabelFromDate(taxYear.start);

	if (isVerboseDebug()) {
		devLog("accountsInterest", "Loading interest breakdown report", {
			userId: user.id,
			year,
		});
	}

	// Resolve the band for the VIEWED tax year — a past year uses the
	// past-year band (e.g. 2025/26 higher → £500 PSA), not today's.
	const [bandResolution, priorBandResolution] = await Promise.all([
		bandForTaxYear(user.id, canonicalYear),
		bandForTaxYear(user.id, previousTaxYear(canonicalYear)),
	]);
	const taxBand = bandResolution.band;

	// Badge context: current-year expectation framing + band-change note
	const bandInfo = {
		band: taxBand,
		source: bandResolution.source,
		assumedFromTaxYear: bandResolution.fromTaxYear,
		psaAllowanceInCents: getPsaAllowanceInCents(taxBand),
		isCurrentTaxYear: canonicalYear === taxYearLabelFromDate(new Date()),
		bandChangedFromPriorYear: priorBandResolution.band !== taxBand,
	};

	if (isVerboseDebug()) {
		devLog("accountsInterest", "Resolved tax band for year", {
			userId: user.id,
			taxBand,
			canonicalYear,
			source: bandResolution.source,
		});
	}

	try {
		// Get user accounts for filtering transactions
		const userAccounts = await db.query.accounts.findMany({
			where: withUserFilter(user.id, accounts),
			columns: { id: true },
		});

		const accountIds = userAccounts.map((a) => a.id);

		// Get all interest transactions to determine available tax years
		const interestTransactions = await db.query.accountTransactions.findMany({
			where:
				accountIds.length > 0
					? inArray(accountTransactions.accountId, accountIds)
					: eq(accountTransactions.id, 0),
			columns: { transactionDate: true },
		});

		// Build available tax years from transactions
		const availableTaxYears = new Map<
			string,
			{ slug: string; start: Date; end: Date }
		>();
		for (const tx of interestTransactions) {
			const bounds = getUkTaxYearBounds(tx.transactionDate);
			const startYear = bounds.start.getUTCFullYear();
			const endYear = bounds.end.getUTCFullYear();
			const slug = `${startYear}-${String(endYear).slice(-2)}`;

			if (!availableTaxYears.has(slug)) {
				availableTaxYears.set(slug, {
					slug,
					start: bounds.start,
					end: bounds.end,
				});
			}
		}

		// Sort by year (newest first)
		const sortedTaxYears = Array.from(availableTaxYears.values()).sort(
			(a, b) => b.start.getTime() - a.start.getTime(),
		);

		// Generate complete interest breakdown report for the requested year
		const report = await getInterestBreakdownReport({
			userId: user.id,
			taxBand,
			taxYearStart: taxYear.start,
			taxYearEnd: taxYear.end,
		});

		if (isVerboseDebug()) {
			devLog("accountsInterest", "Interest breakdown report generated", {
				userId: user.id,
				actualTotal: report.actual.total,
				projectedTotal: report.projected.total,
				forecastTotal: report.forecast.total,
				taxYearStart: report.meta.taxYearStart,
				taxYearEnd: report.meta.taxYearEnd,
				daysRemaining: report.meta.daysRemainingInTaxYear,
				reconciliationFlags: report.reconciliation.flags.length,
			});
		}

		return {
			user: {
				id: user.id,
				username: user.username,
				taxBand,
			},
			bandInfo,
			meta: report.meta,
			actual: report.actual,
			projected: report.projected,
			forecast: report.forecast,
			reconciliation: report.reconciliation,
			availableTaxYears: sortedTaxYears,
		};
	} catch (error) {
		logError(
			"accountsInterest",
			"Failed to generate interest breakdown report",
			error,
		);
		throw error;
	}
};
