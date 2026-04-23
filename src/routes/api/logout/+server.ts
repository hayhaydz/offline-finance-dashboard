import { eq } from "drizzle-orm";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/db/client";
import { sessions } from "$lib/db/schema";
import { devLog, isVerboseDebug, logError } from "$lib/server/logger";

/**
 * POST /api/logout
 *
 * Handles programmatic logout from session-timer (sendBeacon / fetch).
 * Returns 200 JSON instead of a redirect, making it suitable for
 * fire-and-forget callers like navigator.sendBeacon.
 */
export const POST: RequestHandler = async ({ cookies, locals }) => {
	try {
		const username = locals.user?.username || "unknown";
		if (isVerboseDebug()) {
			devLog("api:logout", "Programmatic logout request", {
				username,
				userId: locals.user?.id,
			});
		}

		const sessionToken = cookies.get("session");

		if (sessionToken) {
			await db.delete(sessions).where(eq(sessions.token, sessionToken));
			if (isVerboseDebug()) {
				devLog("api:logout", "Session deleted from database", { username });
			}
		}

		cookies.delete("session", { path: "/" });

		if (isVerboseDebug()) {
			devLog("api:logout", "Logout successful", { username });
		}

		return json({ success: true });
	} catch (error) {
		logError("api:logout", "Unexpected error during logout", error);
		return json({ success: false }, { status: 500 });
	}
};
