import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { db } from "$lib/db/client";
import { type Account, interestRates } from "$lib/db/schema";
import { formatRate } from "$lib/utils/formatting";
import { devLog, logError, logInfo } from "$lib/server/logger";
import { type Result, type VoidResult, ok, err, okVoid } from "$lib/server/utils/result";

export interface CreateInterestRateData {
	accountId: number;
	rate: number; // Basis points (450 = 4.50%)
	effectiveFrom: Date;
}

export interface InterestRateFilter {
	accountId?: number;
	asOfDate?: Date;
	limit?: number;
	offset?: number;
}

/**
 * Create a new interest rate entry for an account.
 * Rates are stored in basis points (450 = 4.50% AER).
 */
export async function createInterestRate(
	data: CreateInterestRateData,
	account: Account,
): Promise<Result<number>> {
	const [result] = await db
		.insert(interestRates)
		.values({
			accountId: account.id,
			rate: data.rate,
			effectiveFrom: data.effectiveFrom,
			createdAt: new Date(),
		})
		.returning({ id: interestRates.id });

	logInfo("createInterestRate", "Interest rate created", {
		accountId: account.id,
		rate: data.rate,
		effectiveFrom: data.effectiveFrom,
	});

	return ok(result.id);
}

/**
 * Get the current (most recent effective) interest rate for an account.
 * Returns null if no rate is configured.
 */
export async function getCurrentRate(
	accountId: number,
): Promise<number | null> {
	const now = new Date();

	const rate = await db.query.interestRates.findFirst({
		where: and(
			eq(interestRates.accountId, accountId),
			lte(interestRates.effectiveFrom, now),
		),
		orderBy: desc(interestRates.effectiveFrom),
	});

	return rate?.rate ?? null;
}

/**
 * Get current (most recent effective) interest rates for multiple accounts.
 * Returns a map of accountId -> rate (basis points) or null if no rate.
 */
export async function getCurrentRatesForAccounts(
	accountIds: number[],
	asOfDate?: Date,
): Promise<Map<number, number | null>> {
	if (accountIds.length === 0) return new Map();

	const now = asOfDate ?? new Date();
	const result = new Map<number, number | null>();
	for (const id of accountIds) result.set(id, null);

	const rows = await db.query.interestRates.findMany({
		where: and(
			inArray(interestRates.accountId, accountIds),
			lte(interestRates.effectiveFrom, now),
		),
		orderBy: [asc(interestRates.accountId), desc(interestRates.effectiveFrom)],
		columns: {
			accountId: true,
			rate: true,
		},
	});

	for (const row of rows) {
		if (result.get(row.accountId) === null) {
			result.set(row.accountId, row.rate);
		}
	}

	return result;
}

/**
 * Get the current rate as a percentage (e.g., 4.50 instead of 450).
 */
export async function getCurrentRatePercent(
	accountId: number,
): Promise<number | null> {
	const basisPoints = await getCurrentRate(accountId);
	return basisPoints !== null ? basisPoints / 100 : null;
}

/**
 * Get interest rate history for an account.
 * Returns rates ordered by effective date (newest first).
 */
export async function getInterestRateHistory(
	accountId: number,
	limit = 20,
	offset = 0,
) {
	return db.query.interestRates.findMany({
		where: eq(interestRates.accountId, accountId),
		orderBy: desc(interestRates.effectiveFrom),
		limit,
		offset,
	});
}

/**
 * Get all interest rates (for admin/overview purposes).
 */
export async function getAllInterestRates(filter: InterestRateFilter = {}) {
	const conditions = [];

	if (filter.accountId) {
		conditions.push(eq(interestRates.accountId, filter.accountId));
	}

	return db.query.interestRates.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: desc(interestRates.effectiveFrom),
		limit: filter.limit ?? 50,
		offset: filter.offset ?? 0,
		with: {
			account: {
				columns: {
					id: true,
					slug: true,
					name: true,
					type: true,
				},
			},
		},
	});
}

/**
 * Get a single interest rate by ID.
 */
export async function getInterestRateById(id: number) {
	return db.query.interestRates.findFirst({
		where: eq(interestRates.id, id),
		with: {
			account: {
				columns: {
					id: true,
					slug: true,
					name: true,
					userId: true,
				},
			},
		},
	});
}

/**
 * Update an interest rate entry.
 */
export async function updateInterestRate(
	id: number,
	data: {
		rate?: number;
		effectiveFrom?: Date;
	},
): Promise<VoidResult> {
	const rate = await getInterestRateById(id);

	if (!rate) {
		logError("updateInterestRate", "Interest rate not found", { id });
		return err("Interest rate not found");
	}

	await db
		.update(interestRates)
		.set({
			...data,
		})
		.where(eq(interestRates.id, id));

	logInfo("updateInterestRate", "Interest rate updated", { id });

	return okVoid();
}

/**
 * Delete an interest rate entry.
 */
export async function deleteInterestRate(
	id: number,
): Promise<VoidResult> {
	const rate = await getInterestRateById(id);

	if (!rate) {
		logError("deleteInterestRate", "Interest rate not found", { id });
		return err("Interest rate not found");
	}

	await db.delete(interestRates).where(eq(interestRates.id, id));

	logInfo("deleteInterestRate", "Interest rate deleted", { id });

	return okVoid();
}

// Re-export formatRate from shared formatting module
export { formatRate };

/**
 * Convert percentage to basis points.
 * E.g., 4.5 -> 450
 */
export function parseRateToBasisPoints(percentage: number): number {
	return Math.round(percentage * 100);
}
