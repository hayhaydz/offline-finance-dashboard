import { error, fail, redirect } from "@sveltejs/kit";
import { nanoid } from "nanoid";
import { db } from "$lib/db/client";
import { snapshots } from "$lib/db/schema";
import { devLog, isVerboseDebug, logError, logFormData } from "$lib/server/logger";
import { requireAuth, getAuthUser } from "$lib/server/utils/auth-guard";
import {
	calculateSnapshotData,
	getSnapshotByDate,
	getTodayUTC,
} from "$lib/server/snapshot-utils";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	// Calculate preview data for confirmation page
	const previewData = await calculateSnapshotData(user.id);

	// Default to today's date
	const today = getTodayUTC();

	if (isVerboseDebug()) {
		devLog("createSnapshot", "Preview data calculated", {
			netWorth: previewData.netWorth,
			accountsCount: previewData.accountsBreakdown.accounts.length,
			goalsCount: previewData.goalsBreakdown.goals.length,
		});
	}

	return {
		user,
		preview: previewData,
		defaultDate: today,
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		logFormData("createSnapshot", request);

		const formData = await request.formData();
		const snapshotDate = formData.get("snapshotDate") as string;
		const notes = formData.get("notes") as string;

		// Validate date format (YYYY-MM-DD)
		if (!snapshotDate || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
			devLog("createSnapshot", "Invalid date format", { snapshotDate });
			return fail(400, { error: "Invalid date format. Use YYYY-MM-DD." });
		}

		// Validate notes length
			if (notes && notes.length > 10000) {
				return fail(400, { error: "Notes must be 10,000 characters or less" });
			}

			// Check for same-day duplicate
		const existing = await getSnapshotByDate(user.id, snapshotDate);
		if (existing) {
			devLog("createSnapshot", "Duplicate snapshot date", {
				userId: user.id,
				snapshotDate,
				existingSlug: existing.slug,
			});
			return fail(409, {
				error:
					"A snapshot already exists for this date. Delete the existing snapshot first or choose a different date.",
				existingSlug: existing.slug,
			});
		}

		try {
			// Calculate current financial state
			const {
				netWorth,
				totalAssets,
				totalLiabilities,
				totalAllocated,
				accountsBreakdown,
				goalsBreakdown,
				isaBreakdown,
				interestBreakdownDetail,
			} = await calculateSnapshotData(user.id);

			// Create snapshot
			const slug = nanoid(16);
			await db.insert(snapshots).values({
				slug,
				userId: user.id,
				snapshotDate,
				netWorthInCents: netWorth,
				totalAssetsInCents: totalAssets,
				totalLiabilitiesInCents: totalLiabilities,
				totalAllocatedInCents: totalAllocated,
				accountsBreakdown,
				goalsBreakdown,
				isaBreakdown,
				interestBreakdownDetail,
				notes: notes || null,
			});

			if (isVerboseDebug()) {
				devLog("createSnapshot", "Snapshot created successfully", {
					slug,
					userId: user.id,
					snapshotDate,
					netWorthInCents: netWorth,
				});
			}

			throw redirect(302, "/overview/snapshots");
		} catch (err) {
			// Re-throw redirect (success case)
			if (
				err &&
				typeof err === "object" &&
				"status" in err &&
				err.status === 302
			) {
				throw err;
			}

			// Handle other errors
			logError("createSnapshot", "Failed to create snapshot", err);
			return fail(500, {
				error: "Failed to create snapshot. Please try again.",
			});
		}
	},
};
