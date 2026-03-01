import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import type { Account } from "$lib/db/schema";
import { goalAllocations, goals } from "$lib/db/schema";
import {
	calculatePerAccountUnallocated,
	calculateReadyToAssign,
} from "$lib/server/goals";
import { parseCurrency } from "$lib/utils/currency";
import { devLog, logError, logFormData } from "$lib/utils/logger";
import type { Actions, PageServerLoad } from "./$types";

// Extended type for accounts with unallocated and balances
type AccountWithUnallocated = Account & {
	unallocated: number;
	balances: Array<{ balanceInCents: number }>;
};

type AddRowInput = {
	accountId: number;
	selected: boolean;
	amountInCents: number;
};

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		logError("goalsAdd", "Authentication required");
		redirect(302, "/login");
	}

	// Fetch goal by slug
	const goal = await db.query.goals.findFirst({
		where: eq(goals.slug, params.slug),
	});

	if (!goal || goal.deletedAt) {
		logError("goalsAdd", "Goal not found", { slug: params.slug });
		error(404, "Goal not found");
	}

	validateUserAccess(goal, locals.user, "Goal");

	// Fetch user's asset accounts with unallocated balances
	const accountsWithUnallocated = (await calculatePerAccountUnallocated({
		userId: locals.user.id,
	})) as AccountWithUnallocated[];

	// Calculate Ready to Assign for preview
	const { readyToAssign, totalAssets } = await calculateReadyToAssign({
		userId: locals.user.id,
	});

	devLog("goalsAdd", "Loaded add money page", {
		goalId: goal.id,
		goalSlug: goal.slug,
		availableAccounts: accountsWithUnallocated.length,
		readyToAssign,
		totalAssets,
	});

	return {
		goal,
		accounts: accountsWithUnallocated,
		totalAssets,
		readyToAssign,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: goal.name, skipLink: false },
			{ segmentIndex: 2, label: "Add Money", skipLink: false },
		],
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("goalsAdd", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		logFormData("goalsAdd", Object.fromEntries(formData));

		const errors: Record<string, string> = {};

		// Validate goal exists and belongs to user
		const goal = await db.query.goals.findFirst({
			where: eq(goals.slug, params.slug),
		});

		if (!goal || goal.deletedAt) {
			logError("goalsAdd", "Goal not found", { slug: params.slug });
			return fail(404, { error: "Goal not found" });
		}

		validateUserAccess(goal, locals.user, "Goal");

		// Parse batch rows payload (with legacy fallback)
		const rowsJson = formData.get("rows_json");
		let requestedRows: AddRowInput[] = [];

		if (typeof rowsJson === "string" && rowsJson.trim().length > 0) {
			try {
				const parsed = JSON.parse(rowsJson);
				if (!Array.isArray(parsed)) {
					return fail(400, { error: "Invalid allocation rows payload" });
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
				return fail(400, { error: "Invalid allocation rows payload" });
			}
		} else {
			// Legacy single-row fallback
			const amountStr = formData.get("amount") as string;
			const fromAccountId = formData.get("from_account_id") as string;

			if (!fromAccountId) {
				errors.from_account_id = "Please select an account";
			}

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

			requestedRows = [
				{
					accountId: parseInt(fromAccountId, 10),
					selected: true,
					amountInCents,
				},
			];
		}

		const validRows = requestedRows.filter(
			(row) => row.selected && row.amountInCents > 0,
		);
		if (validRows.length === 0) {
			return fail(400, { error: "Enter at least one allocation amount" });
		}

		// Merge duplicate rows by account
		const mergedByAccount = new Map<number, number>();
		for (const row of validRows) {
			mergedByAccount.set(
				row.accountId,
				(mergedByAccount.get(row.accountId) ?? 0) + row.amountInCents,
			);
		}

		// Validate accounts and unallocated limits
		const accountsWithUnallocated = (await calculatePerAccountUnallocated({
			userId: locals.user.id,
		})) as AccountWithUnallocated[];
		const availableByAccount = new Map(
			accountsWithUnallocated.map((account) => [
				account.id,
				{ available: account.unallocated, name: account.name },
			]),
		);

		for (const [accountId, amountInCents] of mergedByAccount.entries()) {
			const account = availableByAccount.get(accountId);
			if (!account) {
				return fail(400, { error: `Account ${accountId} not found` });
			}
			if (amountInCents > account.available) {
				return fail(400, {
					error: `Insufficient funds in ${account.name}. Available £${(
						account.available / 100
					).toFixed(2)}`,
				});
			}
		}

		const mergedRows = Array.from(mergedByAccount.entries()).map(
			([accountId, amountInCents]) => ({ accountId, amountInCents }),
		);
		const totalAdding = mergedRows.reduce(
			(sum, row) => sum + row.amountInCents,
			0,
		);
		const newAllocation = goal.currentAllocation + totalAdding;

		db.transaction((tx) => {
			for (const row of mergedRows) {
				tx.insert(goalAllocations)
					.values({
						goalId: goal.id,
						accountId: row.accountId,
						amount: row.amountInCents,
						type: "USER_ADD",
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

		devLog("goalsAdd", "Allocation batch added", {
			goalId: goal.id,
			rows: mergedRows.length,
			totalAdding,
			newAllocation,
		});

		// Redirect to goals list (no success modal per user decision)
		redirect(303, `/goals/${params.slug}`);
	},
};
