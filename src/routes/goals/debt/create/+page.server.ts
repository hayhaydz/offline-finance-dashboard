import { fail, redirect } from "@sveltejs/kit";
import { nanoid } from "nanoid";
import { eq, and, isNull } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, goals, goalMilestones } from "$lib/db/schema";
import { getCurrentBalanceForAccount } from "$lib/server/derivedBalances";
import { generateDefaultMilestones } from "$lib/server/goals";
import { devLog, logError, logFormData } from "$lib/utils/logger";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	const allLiabilityAccounts = await db.query.accounts.findMany({
		where: and(
			withUserFilter(locals.user.id, accounts),
			eq(accounts.category, "liability"),
			isNull(accounts.closedAt)
		),
	});

	const existingDebtGoals = await db.query.goals.findMany({
		where: eq(goals.goalType, "debt"),
		columns: { linkedAccountId: true },
	});
	const linkedAccountIds = new Set(
		existingDebtGoals.map((g) => g.linkedAccountId).filter((id): id is number => id !== null)
	);

	const availableAccounts = allLiabilityAccounts.filter((acc) => !linkedAccountIds.has(acc.id));

	return { user: locals.user, availableAccounts };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) {
			logError("debtGoalCreate", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		logFormData("debtGoalCreate", Object.fromEntries(formData));

		const linkedAccountIdStr = formData.get("linked_account_id") as string;
		const name = formData.get("name") as string;
		const targetDateStr = formData.get("target_date") as string;

		const errors: Record<string, string> = {};

		if (!linkedAccountIdStr) {
			errors.linked_account_id = "Please select an account";
		}

		if (!name || name.trim().length === 0) {
			errors.name = "Goal name is required";
		} else if (name.trim().length > 100) {
			errors.name = "Goal name must be 100 characters or less";
		}

		let targetDate: Date | undefined;
		if (targetDateStr?.trim()) {
			const parsed = new Date(targetDateStr);
			if (Number.isNaN(parsed.getTime())) {
				errors.target_date = "Invalid date format";
			} else if (parsed < new Date()) {
				errors.target_date = "Target date cannot be in the past";
			} else {
				targetDate = parsed;
			}
		}

		if (Object.keys(errors).length > 0) {
			return fail(400, {
				error: "Please fix errors below",
				errors,
				data: {
					linkedAccountId: linkedAccountIdStr || "",
					name: name || "",
					targetDate: targetDateStr || "",
				},
			});
		}

		const linkedAccountId = parseInt(linkedAccountIdStr, 10);

		const account = await db.query.accounts.findFirst({
			where: eq(accounts.id, linkedAccountId),
		});

		if (!account || account.userId !== locals.user.id) {
			errors.linked_account_id = "Account not found";
			return fail(400, { error: "Please fix errors", errors, data: { linkedAccountId: linkedAccountIdStr || "", name: name || "", targetDate: targetDateStr || "" } });
		}

		const currentBalance = await getCurrentBalanceForAccount(linkedAccountId);
		const startingBalanceInCents = currentBalance;

		devLog("debtGoalCreate", "Validation passed", {
			linkedAccountId,
			name: name.trim(),
			startingBalanceInCents,
			targetDate: targetDate?.toISOString(),
		});

		const slug = nanoid(16);
		const userId = locals.user.id;

		try {
			const [newGoal] = await db.transaction(async (tx) => {
				const [goal] = await tx
					.insert(goals)
					.values({
						userId,
						slug,
						name: name.trim(),
						goalType: "debt",
						linkedAccountId,
						startingBalanceInCents,
						targetAmountInCents: 0,
						targetDate: targetDate,
						currentAllocation: 0,
					})
					.returning();

				const milestoneTemplates = generateDefaultMilestones({
					startingBalanceInCents,
				});

				for (const tmpl of milestoneTemplates) {
					await tx.insert(goalMilestones).values({
						goalId: goal.id,
						label: tmpl.label,
						thresholdInCents: tmpl.thresholdInCents,
						reachedAt: null,
					});
				}

				return [goal];
			});

			devLog("debtGoalCreate", "Debt goal created", {
				goalId: newGoal.id,
				slug,
				name: newGoal.name,
			});

			redirect(303, "/goals/debt");
		} catch (err) {
			logError("debtGoalCreate", "Failed to create debt goal", err);
			return fail(500, { error: "Failed to create debt goal" });
		}
	},
};
