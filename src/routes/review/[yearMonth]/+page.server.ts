import { error, fail, redirect } from "@sveltejs/kit";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { goals, snapshots } from "$lib/db/schema";
import { devLog, logError } from "$lib/utils/logger";
import {
	CHECKLIST_ITEMS,
	currentYearMonth,
	formatYearMonth,
	getOrCreateReview,
	isValidYearMonth,
	toggleChecklistItem,
	updateReviewNotes,
} from "$lib/server/reviews";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		devLog("review/month", "Unauthenticated, redirecting to login");
		redirect(302, "/login");
	}

	const { yearMonth } = params;

	if (!isValidYearMonth(yearMonth)) {
		error(404, "Invalid month format. Use YYYY-MM.");
	}

	const review = await getOrCreateReview(locals.user.id, yearMonth);

	// Load active goals
	const userGoals = await db.query.goals.findMany({
		where: and(withUserFilter(locals.user.id, goals), isNull(goals.deletedAt)),
		orderBy: (goals, { asc }) => asc(goals.sortOrder),
	});

	// Load most recent snapshot BEFORE this yearMonth for MoM delta
	const [year, month] = yearMonth.split("-").map(Number);
	const monthStart = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;

	const priorSnapshot = await db.query.snapshots.findFirst({
		where: and(
			withUserFilter(locals.user.id, snapshots),
			lt(snapshots.snapshotDate, monthStart),
		),
		orderBy: [desc(snapshots.snapshotDate)],
	});

	// Build prior goal allocation map from snapshot's goalsBreakdown JSON
	const priorGoalAllocation = new Map<number, number>();
	if (priorSnapshot?.goalsBreakdown) {
		for (const g of priorSnapshot.goalsBreakdown.goals) {
			priorGoalAllocation.set(g.goalId, g.currentAllocation);
		}
	}

	// Build goal progress rows
	const goalProgress = userGoals.map((g) => {
		const prior = priorGoalAllocation.get(g.id) ?? null;
		const momDelta =
			prior !== null ? g.currentAllocation - prior : null;
		const percent =
			g.targetAmountInCents > 0
				? Math.min(
						100,
						Math.round((g.currentAllocation / g.targetAmountInCents) * 100),
					)
				: 0;

		return {
			id: g.id,
			slug: g.slug,
			name: g.name,
			targetAmountInCents: g.targetAmountInCents,
			currentAllocation: g.currentAllocation,
			percent,
			momDelta,
		};
	});

	const thisMonth = currentYearMonth();
	const isCurrentMonth = yearMonth === thisMonth;
	const label = formatYearMonth(yearMonth);

	devLog("review/month", "Loaded review month", {
		userId: locals.user.id,
		yearMonth,
		completedItems: review.completedItems,
		goalCount: userGoals.length,
		hasPriorSnapshot: !!priorSnapshot,
	});

	return {
		review,
		checklistItems: CHECKLIST_ITEMS,
		goalProgress,
		yearMonth,
		label,
		isCurrentMonth,
		thisMonth,
	};
};

export const actions: Actions = {
	toggle: async ({ request, locals, params }) => {
		if (!locals.user) {
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		const reviewSlug = formData.get("reviewSlug")?.toString();
		const itemKey = formData.get("itemKey")?.toString();

		if (!reviewSlug || !itemKey) {
			return fail(400, { error: "Missing parameters" });
		}

		const result = await toggleChecklistItem(
			reviewSlug,
			itemKey,
			locals.user.id,
		);

		if (!result) {
			logError("review/toggle", "Toggle failed", {
				reviewSlug,
				itemKey,
				userId: locals.user.id,
			});
			return fail(404, { error: "Review not found" });
		}

		return { success: true, completedItems: result.completedItems };
	},

	saveNotes: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: "Authentication required" });
		}

		const formData = await request.formData();
		const reviewSlug = formData.get("reviewSlug")?.toString();
		const notes = formData.get("notes")?.toString() ?? "";

		if (!reviewSlug) {
			return fail(400, { error: "Missing review slug" });
		}

		const result = await updateReviewNotes(
			reviewSlug,
			notes,
			locals.user.id,
		);

		if (!result) {
			return fail(404, { error: "Review not found" });
		}

		return { success: true };
	},
};
