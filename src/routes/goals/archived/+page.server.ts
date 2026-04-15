import { redirect } from "@sveltejs/kit";
import { and, count, isNotNull } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { goals } from "$lib/db/schema";
import { calculateReadyToAssign } from "$lib/server/goals";
import { devLog } from "$lib/server/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		devLog("goalsArchived", "Unauthenticated user, redirecting to login");
		redirect(302, "/login");
	}

	// Pagination for archived goals (1-indexed URL parameters)
	const GOALS_PER_PAGE = 20;
	const pageParam = url.searchParams.get("page");
	const parsedPage = pageParam ? Number.parseInt(pageParam, 10) : 1;
	const validPage =
		Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

	// Get total count for pagination
	const [{ total }] = await db
		.select({ total: count() })
		.from(goals)
		.where(
			and(withUserFilter(locals.user.id, goals), isNotNull(goals.deletedAt)),
		);
	const totalPages = Math.ceil(total / GOALS_PER_PAGE);
	// Convert 1-indexed to 0-indexed and clamp to valid range
	const safePage = Math.min(validPage - 1, Math.max(0, totalPages - 1));
	const offset = safePage * GOALS_PER_PAGE;

	// Query user's archived goals (deletedAt IS NOT NULL) with row-level security
	const archivedGoals = await db.query.goals.findMany({
		where: and(
			withUserFilter(locals.user.id, goals),
			isNotNull(goals.deletedAt),
		),
		orderBy: (goals, { asc }) => asc(goals.sortOrder),
		limit: GOALS_PER_PAGE,
		offset,
	});

	devLog("goalsArchived", "Loaded archived goals", {
		count: archivedGoals.length,
	});

	// Calculate Ready to Assign (for context, though archived page is read-only)
	const { readyToAssign, totalAssets, totalSavingsAllocated } =
		await calculateReadyToAssign({
			userId: locals.user.id,
		});

	return {
		goals: archivedGoals,
		goalsPagination: {
			page: safePage,
			totalPages,
		},
		totalCount: total,
		readyToAssign,
		totalAssets,
		totalSavingsAllocated,
		user: {
			id: locals.user.id,
			username: locals.user.username,
			createdAt: locals.user.createdAt,
		},
	};
};
