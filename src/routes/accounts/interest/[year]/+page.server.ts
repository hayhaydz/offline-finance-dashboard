import { redirect } from "@sveltejs/kit";
import { eq, inArray } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, accountTransactions, users } from "$lib/db/schema";
import { getUkTaxYearBounds } from "$lib/utils/tax-year-utils";
import { getInterestBreakdownReport } from "$lib/server/interestBreakdown";
import { devLog, logError } from "$lib/server/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		devLog("accountsInterest", "Unauthenticated access, redirecting to login");
		redirect(302, "/login");
	}

	const { year } = params;
	const taxYear = getUkTaxYearBounds(year);

	devLog("accountsInterest", "Loading interest breakdown report", {
		userId: locals.user.id,
		year,
	});

	// Get user's tax band for PSA calculation
	const userWithTaxBand = await db.query.users.findFirst({
		where: eq(users.id, locals.user.id),
		columns: { taxBand: true },
	});

	const taxBand = userWithTaxBand?.taxBand ?? "basic";

	devLog("accountsInterest", "Retrieved user tax band", {
		userId: locals.user.id,
		taxBand,
	});

	try {
		// Get user accounts for filtering transactions
		const userAccounts = await db.query.accounts.findMany({
			where: withUserFilter(locals.user.id, accounts),
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
			userId: locals.user.id,
			taxBand,
			taxYearStart: taxYear.start,
			taxYearEnd: taxYear.end,
		});

		devLog("accountsInterest", "Interest breakdown report generated", {
			userId: locals.user.id,
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
				id: locals.user.id,
				username: locals.user.username,
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
