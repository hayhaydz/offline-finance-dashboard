import { fail, redirect } from "@sveltejs/kit";
import { asc, count, eq } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { getAlerts } from "$lib/server/alerts";
import { db } from "$lib/db/client";
import { accounts, goals, users } from "$lib/db/schema";
import {
	getActualInterestByTaxWrapper,
	getISAAllowanceUsed,
	getProjectedInterestByTaxWrapper,
	getTaxFreeStatus,
	getUkTaxYearBounds,
	ISA_ALLOWANCE_IN_CENTS,
} from "$lib/server/calculations";
import {
	getCurrentBalancesForAccounts,
	getLatestTransactionDateForAccounts,
} from "$lib/server/derivedBalances";
import { updateTypeExclusions } from "$lib/server/exclusions";
import { getNetWorthSummary } from "$lib/server/finance";
import { calculateISAPacing } from "$lib/server/isaPacing";
import { devLog, isVerboseDebug, logError } from "$lib/utils/logger";
import { getStaleness } from "$lib/utils/staleness";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		devLog("homePage", "Unauthenticated access, redirecting to login");
		redirect(302, "/login");
	}

	devLog("homePage", "Loading net worth data for user", {
		userId: locals.user.id,
	});

	// Pagination for accounts and goals (1-indexed URL parameters)
	const ACCOUNTS_PER_PAGE = 10;
	const GOALS_PER_PAGE = 10;
	const accountsPageParam = Number(url.searchParams.get("accountsPage")) || 1;
	const goalsPageParam = Number(url.searchParams.get("goalsPage")) || 1;

	// Fetch total counts for pagination
	const [{ totalAccounts }] = await db
		.select({ totalAccounts: count() })
		.from(accounts)
		.where(withUserFilter(locals.user.id, accounts));
	const [{ totalGoals }] = await db
		.select({ totalGoals: count() })
		.from(goals)
		.where(withUserFilter(locals.user.id, goals));

	const totalAccountPages = Math.ceil(totalAccounts / ACCOUNTS_PER_PAGE);
	const totalGoalPages = Math.ceil(totalGoals / GOALS_PER_PAGE);
	// Convert 1-indexed URL to 0-indexed internal and clamp to valid range
	const safeAccountsPage = Math.min(
		Math.max(0, accountsPageParam - 1),
		Math.max(0, totalAccountPages - 1),
	);
	const safeGoalsPage = Math.min(
		Math.max(0, goalsPageParam - 1),
		Math.max(0, totalGoalPages - 1),
	);

	// Fetch paginated user accounts
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(locals.user.id, accounts),
		limit: ACCOUNTS_PER_PAGE,
		offset: safeAccountsPage * ACCOUNTS_PER_PAGE,
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

	// Fetch paginated goals for homepage preview
	const userGoals = await db.query.goals.findMany({
		where: withUserFilter(locals.user.id, goals),
		orderBy: [asc(goals.sortOrder)],
		limit: GOALS_PER_PAGE,
		offset: safeGoalsPage * GOALS_PER_PAGE,
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

	// Calculate net worth summary (shared utility)
	const netWorthSummary = await getNetWorthSummary(locals.user.id);

	const alerts = await getAlerts(locals.user.id);

	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);

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
		pacing: await calculateISAPacing(locals.user.id),
	};

	// Calculate interest summary — uses ALL accounts (not paginated)
	const interestActual = await getActualInterestByTaxWrapper(
		locals.user.id,
		taxYear.start,
		taxYear.end,
	);
	const actualInterestTaxFree = interestActual.taxFree;
	const actualInterestTaxable = interestActual.taxable;

	// Projected interest for remaining tax year — uses ALL accounts
	const interestProjected = await getProjectedInterestByTaxWrapper(
		locals.user.id,
		taxYear.start,
		taxYear.end,
		today,
	);
	const totalProjectedTaxFree = interestProjected.taxFree;
	const totalProjectedTaxable = interestProjected.taxable;
	const daysRemainingInTaxYear = interestProjected.daysRemaining;

	// Get user's tax band for allowance calculation
	const userWithTaxBand = await db.query.users.findFirst({
		where: eq(users.id, locals.user.id),
		columns: { taxBand: true },
	});
	const taxBand = userWithTaxBand?.taxBand ?? "basic";

	const totalExpectedTaxable = actualInterestTaxable + totalProjectedTaxable;
	const totalExpectedTaxFree = actualInterestTaxFree + totalProjectedTaxFree;

	const taxFreeStatusNow = getTaxFreeStatus(actualInterestTaxable, taxBand);
	const taxFreeStatusProjected = getTaxFreeStatus(
		totalExpectedTaxable,
		taxBand,
	);

	const interestSummary = {
		actualInterestIsa: actualInterestTaxFree,
		actualInterestNonIsa: actualInterestTaxable,
		projectedInterestIsa: totalProjectedTaxFree,
		projectedInterestNonIsa: totalProjectedTaxable,
		totalExpectedIsa: totalExpectedTaxFree,
		totalExpectedNonIsa: totalExpectedTaxable,
		taxBand,
		taxFreeStatusNow,
		taxFreeStatusProjected,
		taxYearStart: taxYear.start,
		taxYearEnd: taxYear.end,
		daysRemainingInTaxYear,
	};

	// Calculate staleness based on newest balance date
	const staleness = getStaleness(netWorthSummary.dateRange.newest);

	return {
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt,
		},
		netWorthSummary,
		accounts: accountsWithDerivedBalances,
		accountsPagination: {
			page: safeAccountsPage,
			totalPages: totalAccountPages,
		},
		alerts,
		isaTracker,
		interestSummary,
		goals: activeGoals,
		goalsPagination: {
			page: safeGoalsPage,
			totalPages: totalGoalPages,
		},
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
