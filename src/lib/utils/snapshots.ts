import { and, eq, isNull } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accounts, goals, snapshots } from "$lib/db/schema";
import { getCurrentBalancesForAccounts } from "$lib/server/derivedBalances";
import { calculateAssetsAndLiabilities } from "$lib/server/finance";
import {
	calculateInterestBreakdown,
	calculateISAAllowanceBreakdown,
} from "$lib/server/snapshotBreakdowns";
import { devLog } from "$lib/utils/logger";

/**
 * Calculate current snapshot data from accounts and goals
 * Returns net worth, totals, and JSON breakdowns for point-in-time preservation
 */
export async function calculateSnapshotData(
	userId: number,
	snapshotDate?: Date,
) {
	const effectiveDate = snapshotDate ?? new Date();
	devLog("calculateSnapshotData", "Calculating snapshot data", {
		userId,
		snapshotDate: effectiveDate,
	});

	// Fetch all user accounts
	const allAccounts = await db.query.accounts.findMany({
		where: and(
			eq(accounts.userId, userId),
			isNull(accounts.closedAt), // Only open accounts
		),
	});
	const balanceMap = await getCurrentBalancesForAccounts(
		allAccounts.map((a) => a.id),
	);

	// Fetch all active goals
	const allGoals = await db.query.goals.findMany({
		where: and(eq(goals.userId, userId), isNull(goals.deletedAt)),
	});

	// Calculate totals (only include accounts not excluded from net worth)
	const includedAccounts = allAccounts
		.filter((a) => !a.excludedFromNetWorth)
		.map((a) => ({
			...a,
			currentBalance: balanceMap.get(a.id) ?? 0,
		}));
	const { totalAssets, totalLiabilities, netWorth } =
		calculateAssetsAndLiabilities(includedAccounts);
	const totalAllocated = allGoals.reduce(
		(sum, g) => sum + g.currentAllocation,
		0,
	);

	// Build accounts breakdown JSON
	const accountsBreakdown = {
		snapshotTakenAt: new Date().toISOString(),
		accounts: allAccounts.map((a) => ({
			accountId: a.id,
			accountSlug: a.slug,
			name: a.name,
			type: a.type,
			category: a.category as "asset" | "liability",
			taxWrapper: a.taxWrapper as "none" | "isa" | "lisa" | "premium-bonds",
			balanceInCents: balanceMap.get(a.id) ?? 0,
			includedInTotal: !a.excludedFromNetWorth,
			maturityDate: a.maturityDate ? a.maturityDate.toISOString() : null,
		})),
		totalByType: allAccounts.reduce(
			(acc, a) => {
				acc[a.type] = (acc[a.type] || 0) + (balanceMap.get(a.id) ?? 0);
				return acc;
			},
			{} as Record<string, number>,
		),
	};

	// Build goals breakdown JSON
	const goalsBreakdown = {
		goals: allGoals.map((g) => ({
			goalId: g.id,
			goalSlug: g.slug,
			name: g.name,
			targetAmountInCents: g.targetAmountInCents,
			currentAllocation: g.currentAllocation,
			isEmergencyFund: g.isEmergencyFund,
		})),
		totalAllocated,
	};

	// Calculate ISA and interest breakdown (now separate objects with metadata)
	const [isaData, interestData] = await Promise.all([
		calculateISAAllowanceBreakdown(userId, effectiveDate),
		calculateInterestBreakdown(userId, allAccounts, effectiveDate, "basic"), // TODO: Fetch user's actual taxBand
	]);

	devLog("calculateSnapshotData", "Snapshot data calculated", {
		netWorth,
		totalAssets,
		totalLiabilities,
		totalAllocated,
		accountsCount: allAccounts.length,
		goalsCount: allGoals.length,
		hasISAAndInterest: true,
	});

	return {
		netWorth,
		totalAssets,
		totalLiabilities,
		totalAllocated,
		accountsBreakdown,
		goalsBreakdown,
		isaBreakdown: isaData,
		interestBreakdownDetail: interestData,
	};
}

/**
 * Check if snapshot exists for a specific date
 */
export async function getSnapshotByDate(
	userId: number,
	snapshotDate: string,
): Promise<{ slug: string } | null> {
	const existing = await db.query.snapshots.findFirst({
		columns: {
			slug: true,
		},
		where: and(
			eq(snapshots.userId, userId),
			eq(snapshots.snapshotDate, snapshotDate),
		),
	});
	return existing ?? null;
}

/**
 * Get date-only ISO string (YYYY-MM-DD) in UTC
 */
export function getTodayUTC(): string {
	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);
	return today.toISOString().split("T")[0];
}

/**
 * Type for snapshot preview data
 * Exported for use in CreateSnapshotModal component
 */
export type SnapshotPreviewData = Awaited<
	ReturnType<typeof calculateSnapshotData>
>;
