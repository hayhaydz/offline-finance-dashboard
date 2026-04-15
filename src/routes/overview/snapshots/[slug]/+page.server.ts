import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { snapshots } from "$lib/db/schema";
import { devLog, logError, logFormData } from "$lib/server/logger";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		logError("editSnapshotNotes", "Authentication required");
		throw redirect(302, "/login");
	}

	// Load full snapshot for detail page display
	const snapshot = await db.query.snapshots.findFirst({
		where: eq(snapshots.slug, params.slug),
	});

	if (!snapshot) {
		logError("editSnapshotNotes", "Snapshot not found", { slug: params.slug });
		throw error(404, "Snapshot not found");
	}

	// Validate user owns this snapshot
	try {
		validateUserAccess(snapshot, locals.user, "Snapshot");
	} catch (_err) {
		logError("editSnapshotNotes", "Access denied", {
			userId: locals.user.id,
			snapshotUserId: snapshot.userId,
		});
		throw error(403, "You do not have permission to edit this snapshot");
	}

	devLog("editSnapshotNotes", "Snapshot loaded for editing", {
		slug: params.slug,
		userId: locals.user.id,
	});

	return {
		user: locals.user,
		snapshot,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: snapshot.snapshotDate, skipLink: false },
		],
	};
};

export const actions: Actions = {
	updateNotes: async ({ request, locals, params }) => {
		if (!locals.user) {
			logError("updateNotes", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		logFormData("updateNotes", request);

		// Fetch snapshot to validate ownership (only columns needed for check + notes update)
		const snapshot = await db.query.snapshots.findFirst({
			columns: {
				id: true,
				userId: true,
				slug: true,
				notes: true,
			},
			where: eq(snapshots.slug, params.slug),
		});

		if (!snapshot) {
			logError("updateNotes", "Snapshot not found", { slug: params.slug });
			return fail(404, { error: "Snapshot not found" });
		}

		// Validate user owns this snapshot
		try {
			validateUserAccess(snapshot, locals.user, "Snapshot");
		} catch (_err) {
			logError("updateNotes", "Access denied", {
				userId: locals.user.id,
				snapshotUserId: snapshot.userId,
			});
			return fail(403, {
				error: "You do not have permission to edit this snapshot",
			});
		}

		const formData = await request.formData();
		const notes = formData.get("notes") as string;

		// Validate notes length
		if (notes && notes.length > 10000) {
			return fail(400, { error: "Notes must be 10,000 characters or less" });
		}

		// Only update notes field - financial data is immutable
		try {
			await db
				.update(snapshots)
				.set({ notes: notes || null })
				.where(eq(snapshots.slug, params.slug));

			devLog("updateNotes", "Snapshot notes updated successfully", {
				slug: params.slug,
				userId: locals.user.id,
				hasNotes: !!notes,
			});

			throw redirect(302, "/snapshots");
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
			logError("updateNotes", "Failed to update snapshot notes", err);
			return fail(500, { error: "Failed to update notes. Please try again." });
		}
	},
};
