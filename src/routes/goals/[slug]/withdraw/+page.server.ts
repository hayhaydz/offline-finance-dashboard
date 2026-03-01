import { error, fail, redirect } from "@sveltejs/kit";
import { and, eq, inArray } from "drizzle-orm";
import { validateUserAccess, withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, goalAllocations, goals } from "$lib/db/schema";
import { getGoalAccountNetAllocations } from "$lib/server/goals";
import { parseCurrency } from "$lib/utils/currency";
import { devLog, logError, logFormData } from "$lib/utils/logger";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		logError("goalsWithdraw", "Authentication required");
		redirect(302, "/login");
	}

	// Fetch goal by slug
	const goal = await db.query.goals.findFirst({
		where: eq(goals.slug, params.slug),
	});

	if (!goal || goal.deletedAt) {
		logError("goalsWithdraw", "Goal not found", { slug: params.slug });
		error(404, "Goal not found");
	}

	validateUserAccess(goal, locals.user, "Goal");

	const contributions = await getGoalAccountNetAllocations({
		goalId: goal.id,
	});
	const accountIds = contributions.map((row) => row.accountId);
	const accountMeta =
		accountIds.length > 0
			? await db.query.accounts.findMany({
					where: and(
						withUserFilter(locals.user.id, accounts),
						inArray(accounts.id, accountIds),
					),
				})
			: [];
	const accountById = new Map(
		accountMeta.map((account) => [account.id, account]),
	);
	const withdrawalAccounts = contributions
		.map((row) => ({
			id: row.accountId,
			name: accountById.get(row.accountId)?.name ?? `Account ${row.accountId}`,
			availableToWithdraw: row.netAllocated,
		}))
		.filter((row) => row.availableToWithdraw > 0);

	devLog("goalsWithdraw", "Loaded withdraw page", {
		goalId: goal.id,
		goalSlug: goal.slug,
		currentAllocation: goal.currentAllocation,
		accountCount: withdrawalAccounts.length,
	});

	return {
		goal,
		accounts: withdrawalAccounts,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: goal.name, skipLink: false },
			{ segmentIndex: 2, label: "Withdraw Money", skipLink: false },
		],
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("goalsWithdraw", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		logFormData("goalsWithdraw", Object.fromEntries(formData));

		const errors: Record<string, string> = {};

		// Validate goal exists and belongs to user
		const goal = await db.query.goals.findFirst({
			where: eq(goals.slug, params.slug),
		});

		if (!goal || goal.deletedAt) {
			logError("goalsWithdraw", "Goal not found", { slug: params.slug });
			return fail(404, { error: "Goal not found" });
		}

		validateUserAccess(goal, locals.user, "Goal");

		// Parse batch rows payload (with legacy fallback)
		const rowsJson = formData.get("rows_json");
		let requestedRows: Array<{
			accountId: number;
			selected: boolean;
			amountInCents: number;
		}> = [];

		if (typeof rowsJson === "string" && rowsJson.trim().length > 0) {
			try {
				const parsed = JSON.parse(rowsJson);
				if (!Array.isArray(parsed)) {
					return fail(400, { error: "Invalid withdrawal rows payload" });
				}

				requestedRows = parsed
					.map((row) => ({
						accountId: Number(row.accountId),
						selected: Boolean(row.selected),
						amountInCents: Number(row.amountInCents),
					}))
					.filter((row) => Number.isFinite(row.accountId))
					.filter((row) => Number.isFinite(row.amountInCents));
			} catch (_e) {
				return fail(400, { error: "Invalid withdrawal rows payload" });
			}
		} else {
			const amountStr = formData.get("amount") as string;
			const singleAccountId = formData.get("from_account_id") as string;
			let amountInCents = 0;
			try {
				amountInCents = parseCurrency(amountStr);
				if (amountInCents <= 0) {
					errors.amount = "Amount must be greater than zero";
				}
			} catch (_e) {
				errors.amount =
					"Invalid amount format. Enter amount like 100.00 or 100";
			}
			if (Object.keys(errors).length > 0) {
				return fail(400, { error: "Please fix errors below", errors });
			}
			if (!singleAccountId) {
				return fail(400, { error: "Account is required for withdrawal" });
			}
			requestedRows = [
				{
					accountId: parseInt(singleAccountId, 10),
					selected: true,
					amountInCents,
				},
			];
		}

		const validRows = requestedRows.filter(
			(row) => row.selected && row.amountInCents > 0,
		);
		if (validRows.length === 0) {
			return fail(400, { error: "Enter at least one withdrawal amount" });
		}

		const contributions = await getGoalAccountNetAllocations({
			goalId: goal.id,
		});
		const availableByAccount = new Map(
			contributions.map((row) => [row.accountId, row.netAllocated]),
		);

		// Merge duplicates
		const mergedByAccount = new Map<number, number>();
		for (const row of validRows) {
			mergedByAccount.set(
				row.accountId,
				(mergedByAccount.get(row.accountId) ?? 0) + row.amountInCents,
			);
		}

		for (const [accountId, amount] of mergedByAccount.entries()) {
			const available = availableByAccount.get(accountId) ?? 0;
			if (available <= 0) {
				return fail(400, {
					error: `Account ${accountId} has no withdrawable allocation for this goal`,
				});
			}
			if (amount > available) {
				return fail(400, {
					error: `Withdrawal from account ${accountId} exceeds allocated amount`,
				});
			}
		}

		const distribution = Array.from(mergedByAccount.entries()).map(
			([accountId, amountInCents]) => ({ accountId, amountInCents }),
		);
		const amountInCents = distribution.reduce(
			(sum, row) => sum + row.amountInCents,
			0,
		);

		// Validate sufficient allocation
		if (goal.currentAllocation < amountInCents) {
			errors.amount = `Insufficient allocation. Only £${(goal.currentAllocation / 100).toFixed(2)} available in goal`;
			return fail(400, { error: "Please fix errors below", errors });
		}

		const newAllocation = goal.currentAllocation - amountInCents;
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
				.set({ currentAllocation: newAllocation, updatedAt: new Date() })
				.where(eq(goals.id, goal.id))
				.run();
		});

		devLog("goalsWithdraw", "Withdrawal processed", {
			goalId: goal.id,
			amount: amountInCents,
			newAllocation,
			distributionCount: distribution.length,
		});

		// Redirect to goals list (no success modal per user decision)
		redirect(303, `/goals/${params.slug}`);
	},
};
