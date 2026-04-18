import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "$lib/db/client";
import { interestRates } from "$lib/db/schema";

/**
 * Get the current effective interest rate for an account
 * Returns the most recent rate as of today's date
 * @param accountId - The account ID to fetch rate for
 * @returns Rate in basis points, or 0 if no rate found
 */
export async function getCurrentRate(accountId: number): Promise<number> {
	const today = new Date();

	// Note: RLS filtering happens at the query layer via withUserFilter
	// This function assumes accountId has already been validated/filtered
	const result = await db.query.interestRates.findFirst({
		where: and(
			eq(interestRates.accountId, accountId),
			lte(interestRates.effectiveFrom, today),
		),
		orderBy: [desc(interestRates.effectiveFrom)],
	});

	return result?.rate ?? 0;
}
