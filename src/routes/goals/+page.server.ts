import { fail, redirect } from "@sveltejs/kit";
import { and, asc, count, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { validateUserAccess, withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, goals } from "$lib/db/schema";
import { calculateReadyToAssign, getDebtGoalProgress } from "$lib/server/goals";
import { getCurrentBalancesForAccounts } from "$lib/server/derivedBalances";
import { updateTypeExclusions } from "$lib/server/exclusions";
import { getNetWorthSummary } from "$lib/server/finance";
import {
	devLog,
	isVerboseDebug,
	logError,
	logFormData,
} from "$lib/utils/logger";
import { getMostRecentDate, getStaleness } from "$lib/utils/staleness";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		devLog("goals", "Unauthenticated user, redirecting to login");
		redirect(302, "/login");
	}

	const PAGE_SIZE = 10;
	const pageParam = url.searchParams.get("page");
	const parsedPage = pageParam ? Number.parseInt(pageParam, 10) : 1;
	const validPage =
		Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
	const page = validPage - 1;

	// Parse goal type filter from URL parameter
	const typeParam = url.searchParams.get("type");
	const validType = typeParam === "savings" || typeParam === "debt" || typeParam === "all"
		? typeParam
		: "all";

	// Build where clause based on filter
	const goalTypeFilter = validType === "all"
		? undefined
		: validType === "savings"
			? or(eq(goals.goalType, "savings"), isNull(goals.goalType))
			: eq(goals.goalType, "debt");

	const whereConditions = [
		eq(goals.userId, locals.user.id),
		isNull(goals.deletedAt),
	];

	if (goalTypeFilter) {
		whereConditions.push(goalTypeFilter);
	}

	// Total count for pagination
	const [{ total }] = await db
		.select({ total: count() })
		.from(goals)
		.where(and(...whereConditions));

	const totalPages = Math.ceil(total / PAGE_SIZE);
	const safePage = Math.min(page, Math.max(0, totalPages - 1));

	// Query user's active goals with row-level security
	const userGoals = await db.query.goals.findMany({
		where: and(...whereConditions),
		orderBy: (goals, { asc }) => asc(goals.sortOrder),
		limit: PAGE_SIZE,
		offset: safePage * PAGE_SIZE,
		with: {
			linkedAccount: true, // Load linked account for debt goals
			milestones: true, // Load milestones for all goals
		},
	});

	// Get current balances for all debt goals (for progress calculation)
	const debtGoalAccountIds = userGoals
		.filter(g => g.goalType === 'debt' && g.linkedAccountId !== null)
		.map(g => g.linkedAccountId!)
		.filter((id, i, arr) => arr.indexOf(id) === i); // Deduplicate

	const currentBalances = debtGoalAccountIds.length > 0
		? await getCurrentBalancesForAccounts(debtGoalAccountIds)
		: new Map<number, number>();

	// Enrich goals with progress data for client-side rendering
	const goalsWithProgress = userGoals.map((goal) => {
		if (goal.goalType === 'debt' && goal.linkedAccountId !== null) {
			const currentBalance = currentBalances.get(goal.linkedAccountId) ?? 0;
			const progress = getDebtGoalProgress({
				startingBalanceInCents: goal.startingBalanceInCents ?? 0,
				currentBalanceInCents: currentBalance,
			});

			let color = 'red';
			if (progress.percent >= 70) color = 'green';
			else if (progress.percent >= 30) color = 'amber';

			return {
				...goal,
				currentBalance,
				progress,
				color,
			};
		}

		// Savings goal: use existing allocation data
		return goal;
	});

	devLog("goals", "Loaded user goals", {
		count: goalsWithProgress.length,
		page: safePage,
		totalPages,
		filterType: validType,
	});

	// Calculate Ready to Assign (unallocated assets)
	const { readyToAssign, totalAssets, totalAllocated } =
		await calculateReadyToAssign({
			userId: locals.user.id,
		});

	// Calculate staleness based on most recent goal creation/update
	const goalDates = userGoals.map((g) => new Date(g.createdAt));
	const mostRecentGoalDate = getMostRecentDate(goalDates);
	const staleness = getStaleness(mostRecentGoalDate);

	// Calculate net worth summary (shared utility)
	const netWorthSummary = await getNetWorthSummary(locals.user.id);

	// Fetch all open accounts for the exclusions modal
	const allOpenAccounts = await db.query.accounts.findMany({
		where: and(withUserFilter(locals.user.id, accounts), isNull(accounts.closedAt)),
		columns: {
			id: true,
			name: true,
			type: true,
			category: true,
			excludedFromNetWorth: true,
			taxWrapper: true,
		},
	});

	return {
		netWorthSummary,
		accounts: allOpenAccounts,
		goals: goalsWithProgress,
		page: safePage,
		totalPages,
		readyToAssign,
		totalAssets,
		totalAllocated,
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt,
		},
		staleness,
		filterType: validType as 'all' | 'savings' | 'debt',
	};
};

export const actions: Actions = {
	updateExclusions: async ({ request, locals }) => {
		if (!locals.user) {
			logError("updateExclusions", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
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

		try {
			const result = await updateTypeExclusions({
				userId: locals.user.id,
				typeUpdates,
			});

			devLog("updateExclusions", "Type-based bulk update successful", {
				userId: locals.user.id,
				affectedRows: result.affectedRows,
			});

			return { success: result.message };
		} catch (error) {
			logError("updateExclusions", "Database error during bulk update", error);
			return fail(500, { error: "Failed to update exclusions" });
		}
	},

	// Move a goal to a specific index in the sort order
	moveTo: async ({ request, locals }) => {
		if (!locals.user) {
			logError("moveTo", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}
		const user = locals.user;

		const formData = await request.formData();
		const slug = formData.get("slug")?.toString();
		const targetIndexStr = formData.get("targetIndex")?.toString();

		if (!slug || targetIndexStr === undefined) {
			return fail(400, { error: "Missing parameters" });
		}

		const targetIndex = parseInt(targetIndexStr, 10);
		if (Number.isNaN(targetIndex) || targetIndex < 0) {
			return fail(400, { error: "Invalid target index" });
		}

		try {
			await db.transaction(async (tx) => {
				const allGoals = await tx.query.goals.findMany({
					where: and(withUserFilter(user.id, goals), isNull(goals.deletedAt)),
					orderBy: asc(goals.sortOrder),
				});

				const currentIdx = allGoals.findIndex((g) => g.slug === slug);
				if (currentIdx === -1) {
					throw new Error("GOAL_NOT_FOUND");
				}

				validateUserAccess(allGoals[currentIdx], user, "Goal");

				// Reorder array
				const reordered = [...allGoals];
				const [removed] = reordered.splice(currentIdx, 1);
				const clampedIndex = Math.min(targetIndex, reordered.length);
				reordered.splice(clampedIndex, 0, removed);

				// Persist new sort orders atomically
				for (let i = 0; i < reordered.length; i++) {
					await tx
						.update(goals)
						.set({ sortOrder: i + 1 })
						.where(eq(goals.id, reordered[i].id));
				}
			});

			devLog("moveTo", "Goal reordered", { slug, targetIndex });
		} catch (error) {
			if (error instanceof Error && error.message === "GOAL_NOT_FOUND") {
				return fail(404, { error: "Goal not found" });
			}
			logError("moveTo", "Failed to reorder goal", error);
			return fail(500, { error: "Failed to reorder goal" });
		}

		redirect(302, "/goals");
	},

	// Move goal up in sort order (swap with goal above)
	moveUp: async ({ request, locals }) => {
		if (isVerboseDebug()) {
			devLog("moveUp", "=== ACTION START ===", {
				url: request.url,
				method: request.method,
			});
		}

		if (!locals.user) {
			logError("moveUp", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}
		const user = locals.user;

		const formData = await request.formData();
		if (isVerboseDebug()) {
			devLog("moveUp", "Raw form entries", {
				entries: Array.from(formData.entries()),
			});
		}

		const slug = formData.get("slug")?.toString();
		if (!slug) {
			if (isVerboseDebug()) {
				devLog("moveUp", "Missing slug in form data - available keys", {
					keys: Array.from(formData.keys()),
				});
			}
			return fail(400, { error: "Goal slug is required" });
		}

		if (isVerboseDebug()) {
			devLog("moveUp", "Slug extracted", { slug });
		}

		try {
			await db.transaction(async (tx) => {
				// Get current goal
				const currentGoal = await tx.query.goals.findFirst({
					where: and(
						eq(goals.slug, slug),
						withUserFilter(user.id, goals),
						isNull(goals.deletedAt),
					),
				});

				if (!currentGoal) {
					throw new Error("GOAL_NOT_FOUND");
				}

				if (isVerboseDebug()) {
					devLog("moveUp", "Current goal", {
						slug,
						sortOrder: currentGoal.sortOrder,
						name: currentGoal.name,
					});
				}

				validateUserAccess(currentGoal, user, "Goal");

				// Get all goals to see the full picture
				const allGoals = await tx.query.goals.findMany({
					where: and(withUserFilter(user.id, goals), isNull(goals.deletedAt)),
					orderBy: asc(goals.sortOrder),
				});

				if (isVerboseDebug()) {
					devLog("moveUp", "All goals for context", {
						count: allGoals.length,
						goals: allGoals.map((g) => ({
							slug: g.slug,
							sortOrder: g.sortOrder,
							name: g.name,
						})),
					});
				}

				// Find goal above (lower sortOrder)
				const goalAbove = await tx.query.goals.findFirst({
					where: and(
						withUserFilter(user.id, goals),
						isNull(goals.deletedAt),
						lt(goals.sortOrder, currentGoal.sortOrder),
					),
					orderBy: desc(goals.sortOrder),
				});

				if (!goalAbove) {
					devLog("moveUp", "No goal found above (at top position)", {
						slug,
						currentSortOrder: currentGoal.sortOrder,
					});
				} else {
					if (isVerboseDebug()) {
						devLog("moveUp", "Found goal above to swap with", {
							current: {
								slug,
								sortOrder: currentGoal.sortOrder,
								name: currentGoal.name,
							},
							above: {
								slug: goalAbove.slug,
								sortOrder: goalAbove.sortOrder,
								name: goalAbove.name,
							},
						});
					}

					// Swap sortOrder values atomically
					const temp = currentGoal.sortOrder;
					await tx
						.update(goals)
						.set({ sortOrder: goalAbove.sortOrder })
						.where(eq(goals.id, currentGoal.id));
					await tx
						.update(goals)
						.set({ sortOrder: temp })
						.where(eq(goals.id, goalAbove.id));

					devLog("moveUp", "Swap complete, redirecting to /goals", {
						slug,
						oldSortOrder: temp,
						newSortOrder: goalAbove.sortOrder,
					});
				}
			});
		} catch (error) {
			if (error instanceof Error && error.message === "GOAL_NOT_FOUND") {
				logError("moveUp", "Goal not found", { slug });
				return fail(404, { error: "Goal not found" });
			}
			if (error instanceof Error && error.message.includes("permission")) {
				logError("moveUp", "Access denied", { slug, userId: user.id });
				return fail(403, {
					error: "You do not have permission to move this goal",
				});
			}
			logError("moveUp", "Database error during move up", error);
			return fail(500, { error: "Failed to move goal" });
		}

		// Redirect after successful move (outside try-catch so redirect exception propagates)
		devLog("moveUp", "Action complete, redirecting to /goals");
		redirect(302, "/goals");
	},

	// Move goal down in sort order (swap with goal below)
	moveDown: async ({ request, locals }) => {
		if (!locals.user) {
			logError("moveDown", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}
		const user = locals.user;

		const formData = await request.formData();
		logFormData("moveDown", formData);

		const slug = formData.get("slug")?.toString();
		if (!slug) {
			devLog("moveDown", "Missing slug in form data");
			return fail(400, { error: "Goal slug is required" });
		}

		try {
			await db.transaction(async (tx) => {
				// Get current goal
				const currentGoal = await tx.query.goals.findFirst({
					where: and(
						eq(goals.slug, slug),
						withUserFilter(user.id, goals),
						isNull(goals.deletedAt),
					),
				});

				if (!currentGoal) {
					throw new Error("GOAL_NOT_FOUND");
				}

				validateUserAccess(currentGoal, user, "Goal");

				// Find goal below (higher sortOrder)
				const goalBelow = await tx.query.goals.findFirst({
					where: and(
						withUserFilter(user.id, goals),
						isNull(goals.deletedAt),
						gt(goals.sortOrder, currentGoal.sortOrder),
					),
					orderBy: asc(goals.sortOrder),
				});

				if (!goalBelow) {
					devLog("moveDown", "Goal already at bottom, redirecting", { slug });
				} else {
					// Swap sortOrder values atomically
					const temp = currentGoal.sortOrder;
					await tx
						.update(goals)
						.set({ sortOrder: goalBelow.sortOrder })
						.where(eq(goals.id, currentGoal.id));
					await tx
						.update(goals)
						.set({ sortOrder: temp })
						.where(eq(goals.id, goalBelow.id));

					devLog("moveDown", "Successfully moved goal down", {
						slug,
						swappedWith: goalBelow.slug,
					});
				}
			});
		} catch (error) {
			if (error instanceof Error && error.message === "GOAL_NOT_FOUND") {
				logError("moveDown", "Goal not found", { slug });
				return fail(404, { error: "Goal not found" });
			}
			if (error instanceof Error && error.message.includes("permission")) {
				logError("moveDown", "Access denied", { slug, userId: user.id });
				return fail(403, {
					error: "You do not have permission to move this goal",
				});
			}
			logError("moveDown", "Database error during move down", error);
			return fail(500, { error: "Failed to move goal" });
		}

		// Redirect after successful move (outside try-catch so redirect exception propagates)
		redirect(302, "/goals");
	},
};
