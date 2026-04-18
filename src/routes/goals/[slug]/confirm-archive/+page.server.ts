import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { goalAllocations, goals } from "$lib/db/schema";
import { requireAuth, getAuthUser } from "$lib/server/utils/auth-guard";
import { devLog, isVerboseDebug, logError, logFormData } from "$lib/server/logger";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = requireAuth(locals);

	if (isVerboseDebug()) {
		devLog("goalsArchiveConfirm", "Loading archive confirmation page", {
		slug: params.slug,
		});
	}

	// Fetch goal by slug
	const goal = await db.query.goals.findFirst({
		where: eq(goals.slug, params.slug),
	});

	if (!goal || goal.deletedAt) {
		logError("goalsArchiveConfirm", "Goal not found", { slug: params.slug });
		error(404, "Goal not found");
	}

	validateUserAccess(goal, user, "Goal");

	return {
		goal,
		user: user,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: goal.name, skipLink: false },
			{ segmentIndex: 2, label: "Archive", skipLink: false },
		],
	};
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		logFormData("goalsArchiveConfirm", await request.formData());

		// Fetch goal by slug
		const goal = await db.query.goals.findFirst({
			where: eq(goals.slug, params.slug),
		});

		if (!goal || goal.deletedAt) {
			logError("goalsArchiveConfirm", "Goal not found", { slug: params.slug });
			return fail(404, { error: "Goal not found" });
		}

		validateUserAccess(goal, user, "Goal");

		try {
			// Insert allocation record for the goal deletion (returns money to pool)
			await db.insert(goalAllocations).values({
				goalId: goal.id,
				// accountId: NULL - money returns to Ready to Assign pool, not a specific account
				amount: -goal.currentAllocation, // Negative to return funds to Ready to Assign
				type: "GOAL_DELETED",
				allocationDate: new Date(),
				createdAt: new Date(),
			});

			// Soft delete the goal by setting deletedAt
			await db
				.update(goals)
				.set({ deletedAt: new Date() })
				.where(eq(goals.id, goal.id));

			if (isVerboseDebug()) {
				devLog(
					"goalsArchiveConfirm",
					"Goal archived successfully, redirecting to /goals",
					{
						slug: params.slug,
						returnedAmount: goal.currentAllocation,
					},
				);
			}
		} catch (err) {
			logError("goalsArchiveConfirm", "Failed to archive goal", err);
			return fail(500, { error: "Failed to archive goal. Please try again." });
		}

		// Redirect after successful archive (outside try-catch so redirect exception propagates)
		redirect(303, "/goals");
	},
};
