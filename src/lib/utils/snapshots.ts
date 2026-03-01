import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "$lib/db/client";
import type { Snapshot } from "$lib/db/schema";
import { accountBalances, accounts, goals, snapshots } from "$lib/db/schema";
import { calculateAssetsAndLiabilities } from "$lib/server/finance";
import { devLog } from "$lib/utils/logger";

/**
 * Calculate current snapshot data from accounts and goals
 * Returns net worth, totals, and JSON breakdowns for point-in-time preservation
 */
export async function calculateSnapshotData(userId: number) {
	devLog("calculateSnapshotData", "Calculating snapshot data", { userId });

	// Fetch all user accounts with latest balances
	const allAccounts = await db.query.accounts.findMany({
		where: and(
			eq(accounts.userId, userId),
			isNull(accounts.closedAt), // Only open accounts
		),
		with: {
			balances: {
				orderBy: [desc(accountBalances.asOfDate)],
				limit: 1,
			},
		},
	});

	// Fetch all active goals
	const allGoals = await db.query.goals.findMany({
		where: and(eq(goals.userId, userId), isNull(goals.deletedAt)),
	});

	// Calculate totals (only include accounts not excluded from net worth)
	const includedAccounts = allAccounts.filter((a) => !a.excludedFromNetWorth);
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
			balanceInCents: a.balances[0]?.balanceInCents || 0,
			includedInTotal: !a.excludedFromNetWorth,
		})),
		totalByType: allAccounts.reduce(
			(acc, a) => {
				acc[a.type] = (acc[a.type] || 0) + (a.balances[0]?.balanceInCents || 0);
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

	devLog("calculateSnapshotData", "Snapshot data calculated", {
		netWorth,
		totalAssets,
		totalLiabilities,
		totalAllocated,
		accountsCount: allAccounts.length,
		goalsCount: allGoals.length,
	});

	return {
		netWorth,
		totalAssets,
		totalLiabilities,
		totalAllocated,
		accountsBreakdown,
		goalsBreakdown,
	};
}

/**
 * Check if snapshot exists for a specific date
 */
export async function getSnapshotByDate(
	userId: number,
	snapshotDate: string,
): Promise<Snapshot | null> {
	const existing = await db.query.snapshots.findFirst({
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
