import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { validateUserAccess } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { snapshots } from "$lib/db/schema";
import { devLog, logError } from "$lib/utils/logger";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		redirect(302, "/login");
	}

	const snapshot = await db.query.snapshots.findFirst({
		where: eq(snapshots.slug, params.slug),
	});

	if (!snapshot) {
		logError("deleteSnapshot", "Snapshot not found", { slug: params.slug });
		error(404, "Snapshot not found");
	}

	validateUserAccess(snapshot, locals.user, "Snapshot");

	return {
		snapshot,
		breadcrumbOverrides: [
			{ segmentIndex: 1, label: snapshot.snapshotDate, skipLink: false },
			{ segmentIndex: 2, label: "Delete", skipLink: false },
		],
	};
};

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		if (!locals.user) {
			logError("deleteSnapshot", "Authentication required");
			return fail(401, { error: "Authentication required" });
		}

		devLog("deleteSnapshot", "Delete action initiated", {
			username: locals.user.username,
			slug: params.slug,
		});

		const snapshot = await db.query.snapshots.findFirst({
			where: eq(snapshots.slug, params.slug),
		});

		if (!snapshot) {
			logError("deleteSnapshot", "Snapshot not found", { slug: params.slug });
			return fail(404, { error: "Snapshot not found" });
		}

		try {
			validateUserAccess(snapshot, locals.user, "Snapshot");
		} catch (_err) {
			logError("deleteSnapshot", "Access denied", {
				userId: locals.user.id,
				snapshotUserId: snapshot.userId,
			});
			return fail(403, {
				error: "You do not have permission to delete this snapshot",
			});
		}

		const formData = await request.formData();
		const confirmDate = (formData.get("confirmDate") as string)?.trim();

		if (confirmDate !== snapshot.snapshotDate) {
			return fail(400, {
				error: "Date does not match. Please type the exact date shown.",
			});
		}

		try {
			await db.delete(snapshots).where(eq(snapshots.slug, params.slug));

			devLog("deleteSnapshot", "Snapshot deleted successfully", {
				slug: params.slug,
				userId: locals.user.id,
			});

			throw redirect(302, "/snapshots");
		} catch (err) {
			if (
				err &&
				typeof err === "object" &&
				"status" in err &&
				(err as { status: number }).status === 302
			) {
				throw err;
			}
			logError("deleteSnapshot", "Failed to delete snapshot", err);
			return fail(500, {
				error: "Failed to delete snapshot. Please try again.",
			});
		}
	},
};
