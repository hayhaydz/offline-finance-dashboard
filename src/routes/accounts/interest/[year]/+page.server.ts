import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { users } from "$lib/db/schema";
import { devLog, logError } from "$lib/utils/logger";
import { getInterestBreakdownReport } from "$lib/server/interestBreakdown";
import type { PageServerLoad } from "./$types";

import { getUkTaxYearBounds } from "$lib/server/calculations";

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
		};
	} catch (error) {
		logError("accountsInterest", "Failed to generate interest breakdown report", error);
		throw error;
	}
};
