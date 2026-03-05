import { fail, redirect } from "@sveltejs/kit";
import { asc } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, goals } from "$lib/db/schema";
import {
	ISA_ALLOWANCE_IN_CENTS,
	getISAAllowanceUsed,
	getUkTaxYearBounds,
} from "$lib/server/calculations";
import {
	getCurrentBalancesForAccounts,
	getLatestTransactionDateForAccounts,
} from "$lib/server/derivedBalances";
import { updateTypeExclusions } from "$lib/server/exclusions";
import { calculateAssetsAndLiabilities } from "$lib/server/finance";
import { devLog, isVerboseDebug, logError } from "$lib/utils/logger";
import { getStaleness } from "$lib/utils/staleness";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		devLog("homePage", "Unauthenticated access, redirecting to login");
		redirect(302, "/login");
	}

	devLog("homePage", "Loading net worth data for user", {
		userId: locals.user.id,
	});

	// Fetch all user accounts
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(locals.user.id, accounts),
	});
	const accountIds = userAccounts.map((a) => a.id);
	const [currentBalances, latestTransactionDates] = await Promise.all([
		getCurrentBalancesForAccounts(accountIds),
		getLatestTransactionDateForAccounts(accountIds),
	]);
	const accountsWithDerivedBalances = userAccounts.map((account) => ({
		...account,
		currentBalance: currentBalances.get(account.id) ?? 0,
		lastUpdated: latestTransactionDates.get(account.id) ?? null,
	}));

	devLog("homePage", "Fetched user accounts", {
		accountCount: userAccounts.length,
	});

	// Fetch goals for homepage preview
	const userGoals = await db.query.goals.findMany({
		where: withUserFilter(locals.user.id, goals),
		orderBy: [asc(goals.sortOrder)],
		with: {
			allocations: {
				columns: {
					accountId: true,
					amount: true,
				},
			},
		},
		columns: {
			id: true,
			slug: true,
			name: true,
			targetAmountInCents: true,
			currentAllocation: true,
			targetDate: true,
			isEmergencyFund: true,
			deletedAt: true,
			updatedAt: true,
		},
	});

	// Filter out soft-deleted goals
	const activeGoals = userGoals.filter((g) => !g.deletedAt);

	devLog("homePage", "Fetched user goals", { goalCount: activeGoals.length });

	// Calculate net worth totals
	// Filter included accounts: not excluded AND not closed
	const includedAccounts = accountsWithDerivedBalances.filter(
		(a) => !a.excludedFromNetWorth && !a.closedAt,
	);

	// Filter excluded accounts: excluded AND not closed
	const excludedAccounts = accountsWithDerivedBalances.filter(
		(a) => a.excludedFromNetWorth && !a.closedAt,
	);

	const includedTotals = calculateAssetsAndLiabilities(includedAccounts);
	const excludedTotals = calculateAssetsAndLiabilities(excludedAccounts);
	const totalAssets = includedTotals.totalAssets;
	const totalLiabilities = includedTotals.totalLiabilities;
	const excludedAssets = excludedTotals.totalAssets;
	const excludedLiabilities = excludedTotals.totalLiabilities;
	const netWorth = includedTotals.netWorth;

	// Determine date range from transaction recency.
	const allDates = accountsWithDerivedBalances
		.map((a) => a.lastUpdated)
		.filter((d): d is Date => Boolean(d));
	let oldestDate = new Date();
	let newestDate = new Date();

	if (allDates.length > 0) {
		const dates = allDates.map((d) => d.getTime());
		oldestDate = new Date(Math.min(...dates));
		newestDate = new Date(Math.max(...dates));
	}

	devLog("homePage", "Calculated date range", {
		oldest: oldestDate.toISOString(),
		newest: newestDate.toISOString(),
	});

	// Check for stale data (30+ days old)
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

	const staleAccounts = includedAccounts.filter(
		(a) => a.lastUpdated && a.lastUpdated < thirtyDaysAgo,
	);

	const hasStaleData = staleAccounts.length > 0;

	if (hasStaleData) {
		devLog("homePage", "Found stale accounts", {
			staleCount: staleAccounts.length,
		});
	}

	// Count excluded TYPES (not individual accounts)
	// A type is "excluded" only when ALL open accounts of that type are excluded
	// (matches the modal's all-or-nothing toggle logic; closed accounts are ignored)
	const openAccounts = accountsWithDerivedBalances.filter((a) => !a.closedAt);
	const typeMap = new Map<string, { total: number; excluded: number }>();
	for (const a of openAccounts) {
		const entry = typeMap.get(a.type) ?? { total: 0, excluded: 0 };
		entry.total++;
		if (a.excludedFromNetWorth) entry.excluded++;
		typeMap.set(a.type, entry);
	}
	const excludedTypes = new Set(
		Array.from(typeMap.entries())
			.filter(([, { total, excluded }]) => total > 0 && excluded === total)
			.map(([type]) => type),
	);
	const exclusionCount = excludedTypes.size;

	// Maturity alerts: open accounts maturing in the next 90 days
	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);
	const ninetyDaysAhead = new Date(today);
	ninetyDaysAhead.setUTCDate(ninetyDaysAhead.getUTCDate() + 90);
	const msPerDay = 24 * 60 * 60 * 1000;

	const maturingSoon = accountsWithDerivedBalances
		.filter(
			(a) =>
				!a.closedAt &&
				a.maturityDate &&
				a.maturityDate >= today &&
				a.maturityDate <= ninetyDaysAhead,
		)
		.map((a) => ({
			id: a.id,
			slug: a.slug,
			name: a.name,
			type: a.type,
			maturityDate: a.maturityDate as Date,
			daysToMaturity: Math.ceil(
				((a.maturityDate as Date).getTime() - today.getTime()) / msPerDay,
			),
			currentBalance: a.currentBalance ?? 0,
		}))
		.sort((a, b) => a.maturityDate.getTime() - b.maturityDate.getTime());

	// ISA tracker for current UK tax year (6 Apr -> 5 Apr)
	const taxYear = getUkTaxYearBounds(new Date());
	const isaUsed = await getISAAllowanceUsed(
		locals.user.id,
		taxYear.start,
		taxYear.end,
	);
	const isaTracker = {
		limit: ISA_ALLOWANCE_IN_CENTS,
		used: isaUsed,
		remaining: Math.max(0, ISA_ALLOWANCE_IN_CENTS - isaUsed),
		taxYearStart: taxYear.start,
		taxYearEnd: taxYear.end,
	};

	devLog("homePage", "Exclusion count calculated", {
		excludedTypes: Array.from(excludedTypes),
		exclusionCount,
	});

	devLog("homePage", "Net worth calculation complete", {
		netWorth,
		totalAssets,
		totalLiabilities,
		excludedAssets,
		excludedLiabilities,
		hasStaleData,
		exclusionCount,
	});

	// Calculate staleness based on newest balance date
	const staleness = getStaleness(newestDate);

	return {
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt,
		},
		netWorth,
		totalAssets,
		totalLiabilities,
		excludedAssets,
		excludedLiabilities,
		dateRange: {
			oldest: oldestDate,
			newest: newestDate,
		},
		hasStaleData,
			exclusionCount,
			accounts: accountsWithDerivedBalances,
			maturingSoon,
			isaTracker,
			goals: activeGoals,
			staleness,
		};
};

export const actions: Actions = {
	updateExclusions: async ({ request, locals }) => {
		if (!locals.user) {
			logError("updateExclusions", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();

		// Extract type-level updates (e.g., "type_savings=0", "type_current=1")
		const typeUpdates: Map<string, boolean> = new Map();

		for (const [key, value] of formData.entries()) {
			if (key.startsWith("type_")) {
				const accountType = key.replace("type_", "");
				const excluded = value === "1";
				typeUpdates.set(accountType, excluded);
			}
		}

		if (typeUpdates.size === 0) {
			devLog("updateExclusions", "No valid type updates in form data");
			return fail(400, { error: "No account types selected" });
		}

		devLog("updateExclusions", "Processing type-level exclusion updates", {
			userId: locals.user.id,
			typeCount: typeUpdates.size,
			typeUpdates: Array.from(typeUpdates.entries()).map(
				([type, excluded]) => ({ type, excluded }),
			),
		});

		if (isVerboseDebug()) {
			const beforeUpdate = await db.query.accounts.findMany({
				where: withUserFilter(locals.user.id, accounts),
				columns: { id: true, type: true, excludedFromNetWorth: true },
			});
			devLog("updateExclusions", "Database state BEFORE update", {
				accountsExcludedByType: beforeUpdate.reduce(
					(acc, a) => {
						if (a.excludedFromNetWorth) {
							acc[a.type] = (acc[a.type] || 0) + 1;
						}
						return acc;
					},
					{} as Record<string, number>,
				),
				totalExcludedTypes: new Set(
					beforeUpdate.filter((a) => a.excludedFromNetWorth).map((a) => a.type),
				).size,
			});
		}

		try {
			const result = await updateTypeExclusions({
				userId: locals.user.id,
				typeUpdates,
			});

			if (result.affectedRows === 0) {
				devLog(
					"updateExclusions",
					"No matching open accounts found for selected types",
					{
						userId: locals.user.id,
						typesRequested: Array.from(typeUpdates.keys()),
					},
				);
				return { success: result.message };
			}

			devLog("updateExclusions", "Type-based bulk update successful", {
				userId: locals.user.id,
				affectedRows: result.affectedRows,
				typesUpdated: Array.from(typeUpdates.keys()),
			});

			if (isVerboseDebug()) {
				const afterUpdate = await db.query.accounts.findMany({
					where: withUserFilter(locals.user.id, accounts),
					columns: { id: true, type: true, excludedFromNetWorth: true },
				});
				devLog("updateExclusions", "Database state AFTER update", {
					accountsExcludedByType: afterUpdate.reduce(
						(acc, a) => {
							if (a.excludedFromNetWorth) {
								acc[a.type] = (acc[a.type] || 0) + 1;
							}
							return acc;
						},
						{} as Record<string, number>,
					),
					totalExcludedTypes: new Set(
						afterUpdate
							.filter((a) => a.excludedFromNetWorth)
							.map((a) => a.type),
					).size,
				});
			}

			return { success: result.message };
		} catch (error) {
			logError("updateExclusions", "Database error during bulk update", error);
			return fail(500, { error: "Failed to update exclusions" });
		}
	},
};
