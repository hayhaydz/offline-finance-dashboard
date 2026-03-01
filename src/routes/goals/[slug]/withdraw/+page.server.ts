import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { goalAllocations, goals } from "$lib/db/schema";
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

	devLog("goalsWithdraw", "Loaded withdraw page", {
		goalId: goal.id,
		goalSlug: goal.slug,
		currentAllocation: goal.currentAllocation,
	});

	return {
		goal,
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

		const amountStr = formData.get("amount") as string;

		// Server-side validation
		const errors: Record<string, string> = {};

		// Parse and validate amount
		let amountInCents: number;
		try {
			amountInCents = parseCurrency(amountStr);
			if (amountInCents <= 0) {
				errors.amount = "Amount must be greater than zero";
			}
		} catch (_e) {
			errors.amount = "Invalid amount format. Enter amount like 100.00 or 100";
			// Set a default value to avoid "used before assigned" error
			amountInCents = 0;
		}

		if (Object.keys(errors).length > 0) {
			return fail(400, { error: "Please fix errors below", errors });
		}

		// Validate goal exists and belongs to user
		const goal = await db.query.goals.findFirst({
			where: eq(goals.slug, params.slug),
		});

		if (!goal || goal.deletedAt) {
			logError("goalsWithdraw", "Goal not found", { slug: params.slug });
			return fail(404, { error: "Goal not found" });
		}

		validateUserAccess(goal, locals.user, "Goal");

		// Validate sufficient allocation
		if (goal.currentAllocation < amountInCents) {
			errors.amount = `Insufficient allocation. Only £${(goal.currentAllocation / 100).toFixed(2)} available in goal`;
			return fail(400, { error: "Please fix errors below", errors });
		}

		// Insert allocation record (negative for USER_WITHDRAW)
		// Note: accountId is NULL for withdraws since money returns to Ready to Assign pool
		await db.insert(goalAllocations).values({
			goalId: goal.id,
			// accountId: NULL - money returns to Ready to Assign pool, not a specific account
			amount: -amountInCents, // Negative for withdrawal
			type: "USER_WITHDRAW",
			allocationDate: new Date(),
			createdAt: new Date(),
		});

		// Update goal.current_allocation
		const newAllocation = goal.currentAllocation - amountInCents;
		await db
			.update(goals)
			.set({ currentAllocation: newAllocation, updatedAt: new Date() })
			.where(eq(goals.id, goal.id));

		devLog("goalsWithdraw", "Withdrawal processed", {
			goalId: goal.id,
			amount: amountInCents,
			newAllocation,
		});

		// Redirect to goals list (no success modal per user decision)
		redirect(303, `/goals/${params.slug}`);
	},
};
