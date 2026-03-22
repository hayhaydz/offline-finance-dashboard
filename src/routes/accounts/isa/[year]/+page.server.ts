import { redirect } from "@sveltejs/kit";
import { eq, inArray } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, accountTransactions, users } from "$lib/db/schema";
import { getUkTaxYearBounds } from "$lib/server/calculations";
import { getISABreakdownReport } from "$lib/server/isaBreakdown";
import { devLog, logError } from "$lib/utils/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		devLog("accountsIsa", "Unauthenticated access, redirecting to login");
		redirect(302, "/login");
	}

	const { year } = params;
	const taxYear = getUkTaxYearBounds(year);

	devLog("accountsIsa", "Loading ISA breakdown report", {
		userId: locals.user.id,
		year,
	});

	try {
		// Get user accounts for filtering transactions
		const userAccounts = await db.query.accounts.findMany({
			where: withUserFilter(locals.user.id, accounts),
			columns: { id: true },
		});

		const accountIds = userAccounts.map((a) => a.id);

		// Get all ISA deposit transactions to determine available tax years
		const isaTransactions = await db.query.accountTransactions.findMany({
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
		for (const tx of isaTransactions) {
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

		// Generate complete ISA breakdown report for the requested year
		const report = await getISABreakdownReport({
			userId: locals.user.id,
			taxYearStart: taxYear.start,
			taxYearEnd: taxYear.end,
		});

		devLog("accountsIsa", "ISA breakdown report generated", {
			userId: locals.user.id,
			allowanceUsed: report.meta.allowanceUsed,
			utilizationPercent: report.meta.utilizationPercent,
			taxYearStart: report.meta.taxYearStart,
			taxYearEnd: report.meta.taxYearEnd,
			daysRemaining: report.meta.daysRemainingInTaxYear,
			reconciliationFlags: report.reconciliation.flags.length,
		});

		return {
			user: {
				id: locals.user.id,
				username: locals.user.username,
			},
			meta: report.meta,
			actual: report.actual,
			reconciliation: report.reconciliation,
			availableTaxYears: sortedTaxYears,
		};
	} catch (error) {
		logError(
			"accountsIsa",
			"Failed to generate ISA breakdown report",
			error,
		);
		throw error;
	}
};