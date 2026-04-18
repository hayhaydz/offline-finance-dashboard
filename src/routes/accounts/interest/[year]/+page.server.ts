import { eq, inArray } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { db } from "$lib/db/client";
import { accounts, accountTransactions, users } from "$lib/db/schema";
import { getUkTaxYearBounds } from "$lib/utils/tax-year-utils";
import { getInterestBreakdownReport } from "$lib/server/interestBreakdown";
import { devLog, logError } from "$lib/server/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireAuth(locals);

	const { year } = params;
	const taxYear = getUkTaxYearBounds(year);

	devLog("accountsInterest", "Loading interest breakdown report", {
		userId: user.id,
		year,
	});

	// Get user's tax band for PSA calculation
	const userWithTaxBand = await db.query.users.findFirst({
		where: eq(users.id, user.id),
		columns: { taxBand: true },
	});

	const taxBand = userWithTaxBand?.taxBand ?? "basic";

	devLog("accountsInterest", "Retrieved user tax band", {
		userId: user.id,
		taxBand,
	});

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

		return {
			user: {
				id: user.id,
				username: user.username,
				taxBand,
			},
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
