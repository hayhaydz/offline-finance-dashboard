import { and, eq, isNull } from "drizzle-orm";
import * as schema from "../../../src/lib/db/schema.js";
import type { DB } from "./db.js";
import { slug } from "./helpers.js";

export interface SnapshotOptions {
	/** Override goalsBreakdown to empty array */
	emptyGoals?: boolean;
	/** Force net worth to a negative value regardless of computed result */
	forceNegative?: boolean;
	/** Account slugs to mark as includedInTotal: false in the breakdown */
	forceExcludeAccountSlugs?: string[];
}

export async function createSnapshot(
	db: DB,
	userId: number,
	date: string,
	multiplier: number,
	notes: string | null,
	opts: SnapshotOptions = {},
): Promise<void> {
	const allAccounts = await db.query.accounts.findMany({
		where: eq(schema.accounts.userId, userId),
	});
	const accountIds = allAccounts.map((a) => a.id);
	const allTransactions = await db.query.accountTransactions.findMany({
		columns: { accountId: true, amount: true },
	});
	const balanceByAccount = new Map<number, number>();
	for (const id of accountIds) balanceByAccount.set(id, 0);
	for (const tx of allTransactions) {
		balanceByAccount.set(
			tx.accountId,
			(balanceByAccount.get(tx.accountId) ?? 0) + tx.amount,
		);
	}

	const allGoals = await db.query.goals.findMany({
		where: and(eq(schema.goals.userId, userId), isNull(schema.goals.deletedAt)),
	});

	const openAccounts = allAccounts.filter((a) => !a.closedAt);
	const forceExclude = new Set(opts.forceExcludeAccountSlugs ?? []);

	const accountsWithBalance = openAccounts.map((a) => ({
		...a,
		adjustedBalance: Math.round(
			(balanceByAccount.get(a.id) ?? 0) * multiplier,
		),
	}));

	// Preserve existing behaviour: totals include all open accounts (including excluded ones)
	const totalAssets = accountsWithBalance
		.filter((a) => a.category === "asset")
		.reduce((sum, a) => sum + a.adjustedBalance, 0);

	const totalLiabilities = accountsWithBalance
		.filter((a) => a.category === "liability")
		.reduce((sum, a) => sum + a.adjustedBalance, 0);

	let netWorth = totalAssets + totalLiabilities;
	if (opts.forceNegative && netWorth >= 0) {
		netWorth = -(Math.abs(netWorth) + 50000);
	}

	const goalsForBreakdown = opts.emptyGoals
		? []
		: allGoals.map((g) => ({
				...g,
				adjustedAllocation: Math.round(g.currentAllocation * multiplier),
			}));

	const totalAllocated = goalsForBreakdown.reduce(
		(sum, g) => sum + g.adjustedAllocation,
		0,
	);

	await db.insert(schema.snapshots).values({
		slug: slug(),
		userId,
		snapshotDate: date,
		netWorthInCents: netWorth,
		totalAssetsInCents: totalAssets,
		totalLiabilitiesInCents: totalLiabilities,
		totalAllocatedInCents: totalAllocated,
		accountsBreakdown: {
			snapshotTakenAt: new Date().toISOString(),
			accounts: accountsWithBalance.map((a) => ({
				accountId: a.id,
				accountSlug: a.slug,
				name: a.name,
				type: a.type,
				category: a.category as "asset" | "liability",
				balanceInCents: a.adjustedBalance,
				includedInTotal: !a.excludedFromNetWorth && !forceExclude.has(a.slug),
			})),
			totalByType: accountsWithBalance.reduce(
				(acc, a) => {
					acc[a.type] = (acc[a.type] || 0) + a.adjustedBalance;
					return acc;
				},
				{} as Record<string, number>,
			),
		},
		goalsBreakdown: {
			goals: goalsForBreakdown.map((g) => ({
				goalId: g.id,
				goalSlug: g.slug,
				name: g.name,
				targetAmountInCents: g.targetAmountInCents,
				currentAllocation: g.adjustedAllocation,
				isEmergencyFund: g.isEmergencyFund,
			})),
			totalAllocated,
		},
		notes,
	});
}
