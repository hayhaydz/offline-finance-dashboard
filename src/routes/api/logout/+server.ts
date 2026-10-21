import { json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { hashSessionToken } from "$lib/auth/session-token";
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
 *
 * Authenticated-only side effects (auth-session-hardening): the keyring
 * seals (and the session row is deleted) only when the request carries a
 * VALID session — an unauthenticated cross-site POST must not mutate
 * keyring state (it answers 401 instead).
 */
export const POST: RequestHandler = async ({ cookies, locals }) => {
	try {
		const username = locals.user?.username || "unknown";

		const sessionToken = cookies.get("session");
		let authenticated = !!locals.user;

		if (sessionToken) {
			const tokenHash = hashSessionToken(sessionToken);
			const existing = await db.query.sessions.findFirst({
				where: eq(sessions.token, tokenHash),
			});
			authenticated = authenticated || !!existing;

			if (authenticated) {
				await db.delete(sessions).where(eq(sessions.token, tokenHash));
				cookies.delete("session", { path: "/" });
				if (isVerboseDebug()) {
					devLog("api:logout", "Session deleted from database", { username });
				}
			}
		}

		if (!authenticated) {
			// No valid session on the request: nothing is deleted, the
			// keyring stays as it is (cross-site logout denial).
			return json({ success: false }, { status: 401 });
		}

		// Seal: expiry fires through here and must wipe the DataKey even if
		// the session row already vanished (locals.user still present).
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
