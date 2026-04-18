import { error, fail, redirect } from "@sveltejs/kit";
import { count, desc, eq, sql } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import type { Account } from "$lib/db/schema";
import { accounts, accountTransactions, goalAllocations, goals } from "$lib/db/schema";
import { getCurrentBalanceForAccount } from "$lib/server/derivedBalances";
import { calculateRecentAveragePayment, getCurrentApr } from "$lib/server/debtMetrics";
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
import { requireAuth, getAuthUser } from "$lib/server/utils/auth-guard";
import { devLog, isVerboseDebug, logError, logFormData } from "$lib/server/logger";
import type { Actions, PageServerLoad } from "./$types";

type AccountWithUnallocated = Account & {
	unallocated: number;
	balances: Array<{ balanceInCents: number }>;
};

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const user = requireAuth(locals);

	// Fetch goal by slug
	const goal = await db.query.goals.findFirst({
		where: eq(goals.slug, params.slug),
	});

	if (!goal || goal.deletedAt) {
		logError("goalsDetail", "Goal not found", { slug: params.slug });
		error(404, "Goal not found");
	}

	validateUserAccess(goal, user, "Goal");

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

	// Pagination for source accounts
	const SRC_PAGE_SIZE = 20;
	const srcPageParam = url.searchParams.get("srcPage");
	const srcPage = Math.max(
		0,
		srcPageParam ? parseInt(srcPageParam, 10) - 1 : 0,
	);

	// Fetch account allocation breakdown for this goal (with account details)
	const accountAllocationsRaw = await getGoalAccountNetAllocations({
		goalId: goal.id,
	});

	// Total source accounts count for pagination
	const srcTotalAccounts = accountAllocationsRaw.length;
	const srcTotalPages = Math.ceil(srcTotalAccounts / SRC_PAGE_SIZE);
	const safeSrcPage = Math.min(srcPage, Math.max(0, srcTotalPages - 1));

	// Paginate and enrich with account details
	const paginatedAllocationsRaw = accountAllocationsRaw.slice(
		safeSrcPage * SRC_PAGE_SIZE,
		(safeSrcPage + 1) * SRC_PAGE_SIZE,
	);

	const accountAllocations = await Promise.all(
		paginatedAllocationsRaw.map(async (alloc) => {
			const account = await db.query.accounts.findFirst({
				where: eq(accounts.id, alloc.accountId),
			});
			const currentBalance = account
				? await getCurrentBalanceForAccount(account.id)
				: 0;
			return {
				accountId: alloc.accountId,
				accountSlug: account?.slug ?? "",
				accountName: account?.name ?? "Unknown",
				accountType: account?.type ?? null,
				taxWrapper: account?.taxWrapper ?? null,
				liquidity: account?.liquidity ?? null,
				netAllocated: alloc.netAllocated,
				currentBalance,
			};
		}),
	);

	// Fetch user's asset accounts with unallocated balances (for add money form)
	const accountsWithUnallocated = (await calculatePerAccountUnallocated({
		userId: user.id,
	})) as AccountWithUnallocated[];

	// Calculate Ready to Assign
	const { readyToAssign, totalAssets } = await calculateReadyToAssign({
		userId: user.id,
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

	// Load debt-specific data if this is a debt goal
	let debtData = null;

	if (goal.goalType === 'debt' && goal.linkedAccountId) {
		const linkedAccount = await db.query.accounts.findFirst({
			where: eq(accounts.id, goal.linkedAccountId),
			with: {
				interestRates: {
					orderBy: (interestRates, { desc }) => [desc(interestRates.effectiveFrom)],
					limit: 5,
				},
			},
		});

		if (linkedAccount) {
			const transactions = await db.query.accountTransactions.findMany({
				where: eq(accountTransactions.accountId, goal.linkedAccountId),
				orderBy: [desc(accountTransactions.transactionDate)],
				limit: 100,
			});

			const apr = getCurrentApr(linkedAccount.interestRates.map(r => ({
				rate: r.rate,
				effectiveFrom: r.effectiveFrom,
			})));

			const recentAverage = calculateRecentAveragePayment(
				transactions.map(t => ({
					amount: t.amount,
					createdAt: t.createdAt,
				}))
			);

			const minimumPayment = linkedAccount.minimumPaymentFlat
				?? (linkedAccount.minimumPaymentPercentage && goal.startingBalanceInCents
					? Math.round(Math.abs(goal.startingBalanceInCents) * (linkedAccount.minimumPaymentPercentage / 100))
					: null);

			const defaultPayment = minimumPayment ? minimumPayment * 2 : recentAverage ?? 10000;

			const currentBalance = await getCurrentBalanceForAccount(goal.linkedAccountId);

			// Filter to balance-reducing transactions (negative amounts = payments)
			const payoffHistory = transactions
				.filter(t => t.amount < 0)
				.slice(0, 20)
				.map(t => ({
					id: t.id,
					amount: t.amount,
					type: t.type,
					transactionDate: t.transactionDate,
					description: t.description,
				}));

			debtData = {
				linkedAccount: {
					id: linkedAccount.id,
					slug: linkedAccount.slug,
					name: linkedAccount.name,
					type: linkedAccount.type,
					currentBalance,
					minimumPayment: linkedAccount.minimumPaymentFlat ?? null,
					minimumPaymentType: linkedAccount.minimumPaymentType ?? null,
					apr,
				},
				payoffHistory,
				defaultMonthlyPayment: defaultPayment,
				recentAveragePayment: recentAverage,
			};

			if (isVerboseDebug()) {
				devLog("goalsDetail", "Loaded debt data for goal", {
					goalId: goal.id,
					linkedAccountId: goal.linkedAccountId,
					apr,
					recentAverage,
				});
			}
		}
	}

	if (isVerboseDebug()) {
		devLog("goalsDetail", "Loaded goal detail page", {
			goalId: goal.id,
			goalSlug: goal.slug,
			allocationCount: allocationHistory.length,
		});
	}

	return {
		goal,
		allocationHistory,
		allocPage: safeAllocPage,
		allocTotalPages,
		allocTotal,
		accountAllocations,
		srcPage: safeSrcPage,
		srcTotalPages,
		srcTotalAccounts,
		paceMetrics,
		liquidityBreakdown,
		contributionStats,
		accounts: accountsWithUnallocated,
		totalAssets,
		readyToAssign,
		debtData,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: goal.name, skipLink: false },
		],
	};
};

export const actions: Actions = {
	addMoney: async ({ request, locals, params }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

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

		validateUserAccess(goal, user, "Goal");

		const account = await db.query.accounts.findFirst({
			where: eq(accounts.id, parseInt(fromAccountId, 10)),
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
		const accountBalance = await getCurrentBalanceForAccount(account.id);
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
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

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

		validateUserAccess(goal, user, "Goal");

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
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

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

		validateUserAccess(goal, user, "Goal");

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

export type DebtData = {
	linkedAccount: {
		id: number;
		slug: string;
		name: string;
		type: string;
		currentBalance: number;
		minimumPayment: number | null;
		minimumPaymentType: string | null;
		apr: number | null;
	};
	payoffHistory: Array<{
		id: number;
		amount: number;
		type: string;
		transactionDate: Date;
		description: string | null;
	}>;
	defaultMonthlyPayment: number;
	recentAveragePayment: number | null;
};
