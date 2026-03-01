import { redirect } from "@sveltejs/kit";
import { and, isNotNull } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { goals } from "$lib/db/schema";
import { calculateReadyToAssign } from "$lib/server/goals";
import { devLog } from "$lib/utils/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		devLog("goalsArchived", "Unauthenticated user, redirecting to login");
		redirect(302, "/login");
	}

	// Query user's archived goals (deletedAt IS NOT NULL) with row-level security
	const archivedGoals = await db.query.goals.findMany({
		where: and(
			withUserFilter(locals.user.id, goals),
			isNotNull(goals.deletedAt),
		),
		orderBy: (goals, { asc }) => asc(goals.sortOrder),
	});

	devLog("goalsArchived", "Loaded archived goals", {
		count: archivedGoals.length,
	});

	// Calculate Ready to Assign (for context, though archived page is read-only)
	const { readyToAssign, totalAssets, totalAllocated } =
		await calculateReadyToAssign({
			userId: locals.user.id,
		});

	return {
		goals: archivedGoals,
		readyToAssign,
		totalAssets,
		totalAllocated,
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt,
		},
	};
};
