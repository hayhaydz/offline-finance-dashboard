import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { monthlyReviews } from "$lib/db/schema";
import { devLog, logError, logInfo } from "$lib/server/logger";
import { CHECKLIST_ITEMS, formatYearMonth } from "$lib/utils/reviews";

export type { ChecklistItem } from "$lib/utils/reviews";
export { CHECKLIST_ITEMS, formatYearMonth } from "$lib/utils/reviews";

/**
 * Return "YYYY-MM" string for the current month in UTC.
 */
export function currentYearMonth(): string {
	const now = new Date();
	const y = now.getUTCFullYear();
	const m = String(now.getUTCMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

/**
 * Validate that a yearMonth string is in "YYYY-MM" format and refers to a
 * real month. Returns false for invalid values.
 */
export function isValidYearMonth(value: string): boolean {
	return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/**
 * Fetch an existing review for a given month, or create a blank one.
 */
export async function getOrCreateReview(
	userId: number,
	yearMonth: string,
): Promise<typeof monthlyReviews.$inferSelect> {
	const existing = await db.query.monthlyReviews.findFirst({
		where: and(
			withUserFilter(userId, monthlyReviews),
			eq(monthlyReviews.yearMonth, yearMonth),
		),
	});

	if (existing) {
		devLog("reviews", "Found existing review", { userId, yearMonth });
		return existing;
	}

	devLog("reviews", "Creating new review", { userId, yearMonth });

	const [created] = await db
		.insert(monthlyReviews)
		.values({
			slug: nanoid(21),
			userId,
			yearMonth,
			completedItems: [],
			notes: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.returning();

	return created;
}

/**
 * Toggle a checklist item on/off for a given review.
 * Returns the updated review, or null if not found / not owned by user.
 */
export async function toggleChecklistItem(
	reviewSlug: string,
	itemKey: string,
	userId: number,
): Promise<typeof monthlyReviews.$inferSelect | null> {
	const review = await db.query.monthlyReviews.findFirst({
		where: and(
			withUserFilter(userId, monthlyReviews),
			eq(monthlyReviews.slug, reviewSlug),
		),
	});

	if (!review) {
		logError("reviews", "Review not found or access denied", {
			reviewSlug,
			userId,
		});
		return null;
	}

	const validKeys = new Set(CHECKLIST_ITEMS.map((i) => i.key));
	if (!validKeys.has(itemKey)) {
		logError("reviews", "Invalid checklist item key", { itemKey });
		return null;
	}

	const current = review.completedItems ?? [];
	const updated = current.includes(itemKey)
		? current.filter((k) => k !== itemKey)
		: [...current, itemKey];

	const [result] = await db
		.update(monthlyReviews)
		.set({ completedItems: updated, updatedAt: new Date() })
		.where(eq(monthlyReviews.slug, reviewSlug))
		.returning();

	logInfo("reviews", "Toggled checklist item", {
		reviewSlug,
		itemKey,
		wasChecked: current.includes(itemKey),
		nowChecked: updated.includes(itemKey),
	});

	return result;
}

/**
 * Update the free-text notes for a review.
 */
export async function updateReviewNotes(
	reviewSlug: string,
	notes: string,
	userId: number,
): Promise<typeof monthlyReviews.$inferSelect | null> {
	const review = await db.query.monthlyReviews.findFirst({
		where: and(
			withUserFilter(userId, monthlyReviews),
			eq(monthlyReviews.slug, reviewSlug),
		),
	});

	if (!review) return null;

	const [result] = await db
		.update(monthlyReviews)
		.set({ notes: notes.trim() || null, updatedAt: new Date() })
		.where(eq(monthlyReviews.slug, reviewSlug))
		.returning();

	return result;
}

export interface ReviewHistoryEntry {
	slug: string;
	yearMonth: string;
	label: string;
	completedCount: number;
	totalItems: number;
	isComplete: boolean;
	notes: string | null;
	createdAt: Date;
}

/**
 * Fetch all reviews for a user ordered by yearMonth descending.
 */
export async function getReviewHistory(
	userId: number,
): Promise<ReviewHistoryEntry[]> {
	const rows = await db.query.monthlyReviews.findMany({
		where: withUserFilter(userId, monthlyReviews),
		orderBy: [desc(monthlyReviews.yearMonth)],
	});

	return rows.map((r) => ({
		slug: r.slug,
		yearMonth: r.yearMonth,
		label: formatYearMonth(r.yearMonth),
		completedCount: (r.completedItems ?? []).length,
		totalItems: CHECKLIST_ITEMS.length,
		isComplete: (r.completedItems ?? []).length === CHECKLIST_ITEMS.length,
		notes: r.notes,
		createdAt: r.createdAt,
	}));
}

export interface StreakResult {
	currentStreak: number;
	longestStreak: number;
	lastActiveMonth: string | null;
}

/**
 * Calculate the current and longest streak.
 * A month counts toward a streak if completedItems.length > 0.
 * Streak is consecutive calendar months backwards from the most recent
 * active month (does not require the current month to be started).
 */
export function calculateStreak(
	history: ReviewHistoryEntry[],
): StreakResult {
	if (history.length === 0) {
		return { currentStreak: 0, longestStreak: 0, lastActiveMonth: null };
	}

	// Sort ascending for streak walk
	const sorted = [...history].sort((a, b) =>
		a.yearMonth.localeCompare(b.yearMonth),
	);

	// Build a set of months with at least one item ticked
	const activeMonths = new Set(
		sorted.filter((r) => r.completedCount > 0).map((r) => r.yearMonth),
	);

	if (activeMonths.size === 0) {
		return { currentStreak: 0, longestStreak: 0, lastActiveMonth: null };
	}

	// Walk all active months to find longest streak
	const activeList = Array.from(activeMonths).sort();
	let longestStreak = 1;
	let run = 1;

	for (let i = 1; i < activeList.length; i++) {
		if (areConsecutiveMonths(activeList[i - 1], activeList[i])) {
			run++;
			longestStreak = Math.max(longestStreak, run);
		} else {
			run = 1;
		}
	}

	// Current streak: walk backwards from most recent active month
	const lastActiveMonth = activeList[activeList.length - 1];
	let currentStreak = 1;
	let prev = lastActiveMonth;

	for (let i = activeList.length - 2; i >= 0; i--) {
		if (areConsecutiveMonths(activeList[i], prev)) {
			currentStreak++;
			prev = activeList[i];
		} else {
			break;
		}
	}

	devLog("reviews", "Calculated streak", {
		currentStreak,
		longestStreak,
		lastActiveMonth,
	});

	return { currentStreak, longestStreak, lastActiveMonth };
}

/**
 * Return true if `a` and `b` are consecutive calendar months ("YYYY-MM").
 * e.g. "2026-02" and "2026-03" → true
 */
function areConsecutiveMonths(a: string, b: string): boolean {
	const [ay, am] = a.split("-").map(Number);
	const [by, bm] = b.split("-").map(Number);
	const totalA = ay * 12 + am;
	const totalB = by * 12 + bm;
	return totalB - totalA === 1;
}
