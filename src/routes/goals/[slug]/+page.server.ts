import { error, fail, redirect } from "@sveltejs/kit";
import { count, desc, eq, sql } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import type { Account } from "$lib/db/schema";
import { accounts, goalAllocations, goals } from "$lib/db/schema";
import {
	calculateContributionStats,
	calculateLiquidityBreakdown,
	calculatePaceMetrics,
	calculatePerAccountUnallocated,
	calculateReadyToAssign,
	distributeWithdrawalAcrossAccounts,
	getGoalAccountNetAllocations,
} from "$lib/server/goals";
import { parseCurrency } from "$lib/utils/currency";
import { devLog, logError, logFormData } from "$lib/utils/logger";
import type { Actions, PageServerLoad } from "./$types";

type AccountWithUnallocated = Account & {
	unallocated: number;
	balances: Array<{ balanceInCents: number }>;
};

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) {
		logError("goalsDetail", "Authentication required");
		redirect(302, "/login");
	}

	// Fetch goal by slug
	const goal = await db.query.goals.findFirst({
		where: eq(goals.slug, params.slug),
	});

	if (!goal || goal.deletedAt) {
		logError("goalsDetail", "Goal not found", { slug: params.slug });
		error(404, "Goal not found");
	}

	validateUserAccess(goal, locals.user, "Goal");

	const ALLOC_PAGE_SIZE = 20;
	const allocPageParam = url.searchParams.get("allocPage");
	const allocPage = Math.max(
		0,
		allocPageParam ? parseInt(allocPageParam, 10) - 1 : 0,
	);

	// Total allocation count for pagination
	const [{ total: allocTotal }] = await db
		.select({ total: count() })
		.from(goalAllocations)
		.where(eq(goalAllocations.goalId, goal.id));

	const allocTotalPages = Math.ceil(allocTotal / ALLOC_PAGE_SIZE);
	const safeAllocPage = Math.min(allocPage, Math.max(0, allocTotalPages - 1));

	// Fetch allocation history for this goal
	const allocationHistory = await db.query.goalAllocations.findMany({
		where: eq(goalAllocations.goalId, goal.id),
		orderBy: desc(goalAllocations.createdAt),
		limit: ALLOC_PAGE_SIZE,
		offset: safeAllocPage * ALLOC_PAGE_SIZE,
		with: {
			account: true,
		},
	});

	// Fetch ALL allocation history for metrics calculation (not paginated)
	const allAllocationHistory = await db.query.goalAllocations.findMany({
		where: eq(goalAllocations.goalId, goal.id),
		orderBy: desc(goalAllocations.createdAt),
	});

	// Fetch account allocation breakdown for this goal (with account details)
	const accountAllocationsRaw = await getGoalAccountNetAllocations({
		goalId: goal.id,
	});

	// Enrich with account details
	const accountAllocations = await Promise.all(
		accountAllocationsRaw.map(async (alloc) => {
			const account = await db.query.accounts.findFirst({
				where: eq(accounts.id, alloc.accountId),
				with: {
					balances: {
						orderBy: (balances, { desc }) => desc(balances.asOfDate),
						limit: 1,
					},
				},
			});
			return {
				accountId: alloc.accountId,
				accountName: account?.name ?? "Unknown",
				accountType: account?.type ?? null,
				taxWrapper: account?.taxWrapper ?? null,
				liquidity: account?.liquidity ?? null,
				netAllocated: alloc.netAllocated,
				currentBalance: account?.balances[0]?.balanceInCents ?? 0,
			};
		}),
	);

	// Fetch user's asset accounts with unallocated balances (for add money form)
	const accountsWithUnallocated = (await calculatePerAccountUnallocated({
		userId: locals.user.id,
	})) as AccountWithUnallocated[];

	// Calculate Ready to Assign
	const { readyToAssign, totalAssets } = await calculateReadyToAssign({
		userId: locals.user.id,
	});

	// Calculate contribution stats
	const contributionStats = calculateContributionStats(
		allAllocationHistory.map((a) => ({
			amount: a.amount,
			createdAt: a.createdAt,
			type: a.type,
		})),
	);

	// Calculate pace metrics
	const paceMetrics = calculatePaceMetrics({
		targetAmountInCents: goal.targetAmountInCents,
		currentAllocationInCents: goal.currentAllocation,
		targetDate: goal.targetDate,
		firstContributionDate: contributionStats.firstContributionDate,
	});

	// Calculate liquidity breakdown
	const liquidityBreakdown = calculateLiquidityBreakdown(
		accountAllocations.map((a) => ({
			netAllocated: a.netAllocated,
			liquidity: a.liquidity,
		})),
		goal.targetDate,
	);

	devLog("goalsDetail", "Loaded goal detail page", {
		goalId: goal.id,
		goalSlug: goal.slug,
		allocationCount: allocationHistory.length,
	});

	return {
		goal,
		allocationHistory,
		allocPage: safeAllocPage,
		allocTotalPages,
		accountAllocations,
		paceMetrics,
		liquidityBreakdown,
		contributionStats,
		accounts: accountsWithUnallocated,
		totalAssets,
		readyToAssign,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: goal.name, skipLink: false },
		],
	};
};

export const actions: Actions = {
	addMoney: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("goalsDetailAddMoney", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		logFormData("goalsDetailAddMoney", Object.fromEntries(formData));

		const amountStr = formData.get("amount") as string;
		const fromAccountId = formData.get("from_account_id") as string;

		const errors: Record<string, string> = {};
		if (!fromAccountId) {
			errors.from_account_id = "Please select an account";
		}

		let amountInCents: number;
		try {
			amountInCents = parseCurrency(amountStr);
			if (amountInCents <= 0) {
				errors.amount = "Amount must be greater than zero";
			}
		} catch (_e) {
			errors.amount = "Invalid amount format";
			amountInCents = 0;
		}

		if (Object.keys(errors).length > 0) {
			return fail(400, { error: "Please fix errors", errors });
		}

		const goal = await db.query.goals.findFirst({
			where: eq(goals.slug, params.slug),
		});

		if (!goal || goal.deletedAt) {
			return fail(404, { error: "Goal not found" });
		}

		validateUserAccess(goal, locals.user, "Goal");

		const account = await db.query.accounts.findFirst({
			where: eq(accounts.id, parseInt(fromAccountId, 10)),
			with: {
				balances: {
					orderBy: (balances, { desc }) => desc(balances.asOfDate),
					limit: 1,
				},
			},
		});

		if (!account) {
			errors.from_account_id = "Account not found";
			return fail(400, { error: "Please fix errors", errors });
		}

		const accountAllocations = await db
			.select({
				sum: sql<number>`coalesce(sum(${goalAllocations.amount}), 0)`,
			})
			.from(goalAllocations)
			.where(eq(goalAllocations.accountId, account.id));

		const totalAllocated = Math.max(0, accountAllocations[0]?.sum || 0);
		const accountBalance = account.balances[0]?.balanceInCents || 0;
		const unallocated = accountBalance - totalAllocated;

		if (unallocated < amountInCents) {
			errors.amount = `Insufficient funds. Only £${(unallocated / 100).toFixed(2)} available`;
			return fail(400, { error: "Please fix errors", errors });
		}

		await db.insert(goalAllocations).values({
			goalId: goal.id,
			accountId: account.id,
			amount: amountInCents,
			type: "USER_ADD",
			allocationDate: new Date(),
			createdAt: new Date(),
		});

		await db
			.update(goals)
			.set({
				currentAllocation: goal.currentAllocation + amountInCents,
				updatedAt: new Date(),
			})
			.where(eq(goals.id, goal.id));

		devLog("goalsDetailAddMoney", "Allocation added", {
			goalId: goal.id,
			amount: amountInCents,
		});

		redirect(303, `/goals/${params.slug}`);
	},

	withdrawMoney: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("goalsDetailWithdraw", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		logFormData("goalsDetailWithdraw", Object.fromEntries(formData));

		const amountStr = formData.get("amount") as string;
		const errors: Record<string, string> = {};

		let amountInCents: number;
		try {
			amountInCents = parseCurrency(amountStr);
			if (amountInCents <= 0) {
				errors.amount = "Amount must be greater than zero";
			}
		} catch (_e) {
			errors.amount = "Invalid amount format";
			amountInCents = 0;
		}

		if (Object.keys(errors).length > 0) {
			return fail(400, { error: "Please fix errors", errors });
		}

		const goal = await db.query.goals.findFirst({
			where: eq(goals.slug, params.slug),
		});

		if (!goal || goal.deletedAt) {
			return fail(404, { error: "Goal not found" });
		}

		validateUserAccess(goal, locals.user, "Goal");

		if (goal.currentAllocation < amountInCents) {
			errors.amount = `Insufficient allocation. Only £${(goal.currentAllocation / 100).toFixed(2)} available`;
			return fail(400, { error: "Please fix errors", errors });
		}

		const contributions = await getGoalAccountNetAllocations({
			goalId: goal.id,
		});
		let distribution: Array<{ accountId: number; amountInCents: number }>;
		try {
			distribution = distributeWithdrawalAcrossAccounts({
				amountInCents,
				contributions,
			});
		} catch (error) {
			logError("goalsDetailWithdraw", "Failed to distribute withdrawal", error);
			return fail(400, {
				error: "Unable to distribute withdrawal back to source accounts",
			});
		}

		db.transaction((tx) => {
			for (const row of distribution) {
				tx.insert(goalAllocations)
					.values({
						goalId: goal.id,
						accountId: row.accountId,
						amount: -row.amountInCents,
						type: "USER_WITHDRAW",
						allocationDate: new Date(),
						createdAt: new Date(),
					})
					.run();
			}

			tx.update(goals)
				.set({
					currentAllocation: goal.currentAllocation - amountInCents,
					updatedAt: new Date(),
				})
				.where(eq(goals.id, goal.id))
				.run();
		});

		devLog("goalsDetailWithdraw", "Withdrawal processed", {
			goalId: goal.id,
			amount: amountInCents,
		});

		redirect(303, `/goals/${params.slug}`);
	},

	archiveGoal: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("goalsDetailArchive", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		logFormData("goalsDetailArchive", Object.fromEntries(formData));

		const confirmed = formData.get("confirmed") === "true";
		if (!confirmed) {
			return fail(400, { error: "Please confirm the archive action" });
		}

		const goal = await db.query.goals.findFirst({
			where: eq(goals.slug, params.slug),
		});

		if (!goal || goal.deletedAt) {
			return fail(404, { error: "Goal not found" });
		}

		validateUserAccess(goal, locals.user, "Goal");

		try {
			await db.insert(goalAllocations).values({
				goalId: goal.id,
				accountId: null,
				amount: -goal.currentAllocation,
				type: "GOAL_DELETED",
				allocationDate: new Date(),
				createdAt: new Date(),
			});

			await db
				.update(goals)
				.set({ deletedAt: new Date() })
				.where(eq(goals.id, goal.id));

			devLog("goalsDetailArchive", "Goal archived", { slug: params.slug });

			redirect(303, "/goals");
		} catch (err) {
			logError("goalsDetailArchive", "Failed to archive goal", err);
			return fail(500, { error: "Failed to archive goal" });
		}
	},
};
