import { json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { sessions } from "$lib/db/schema";
import { sealKeyring } from "$lib/server/crypto/keyring";
import { devLog, isVerboseDebug, logError } from "$lib/server/logger";
import type { RequestHandler } from "./$types";

/**
 * POST /api/logout
 *
 * Handles programmatic logout from session-timer (sendBeacon / fetch).
 * Returns 200 JSON instead of a redirect, making it suitable for
 * fire-and-forget callers like navigator.sendBeacon.
 *
 * Logout BOTH ends the session AND seals the keyring (DataKey zeroized) —
 * the single expiry event of spec session-expiry-reliability (MODIFIED).
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

		// Seal regardless of session presence: expiry fires through here and
		// must wipe the DataKey even if the session row already vanished.
		sealKeyring("logout");

		if (isVerboseDebug()) {
			devLog("api:logout", "Logout successful (keyring sealed)", { username });
		}

		return json({ success: true });
	} catch (error) {
		logError("api:logout", "Unexpected error during logout", error);
		return json({ success: false }, { status: 500 });
	}
};
