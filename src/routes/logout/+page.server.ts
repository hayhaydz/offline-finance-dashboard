import { redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { hashSessionToken } from "$lib/auth/session-token";
import { db } from "$lib/db/client";
import { sessions } from "$lib/db/schema";
import { sealKeyring } from "$lib/server/crypto/keyring";
import { devLog, isVerboseDebug, logError } from "$lib/server/logger";

export const actions = {
	default: async ({ cookies, locals }) => {
		try {
			const username = locals.user?.username || "unknown";
			if (isVerboseDebug()) {
				devLog("logout", "User logging out", {
					username,
					userId: locals.user?.id,
				});
			}

			// Get session token from cookie
			const sessionToken = cookies.get("session");

			if (sessionToken) {
				// Delete session from database
				await db
					.delete(sessions)
					.where(eq(sessions.token, hashSessionToken(sessionToken)));
				if (isVerboseDebug())
					devLog("logout", "Session deleted from database", { username });
			}

			// Clear session cookie
			cookies.delete("session", { path: "/" });

			// Logout seals: DataKey zeroized, app returns to sealed state
			// (spec unlock-ceremony: seal triggers wipe observable state).
			sealKeyring("logout");

			if (isVerboseDebug())
				devLog("logout", "Logout successful (keyring sealed)", { username });
		} catch (error) {
			logError("logout", "Unexpected error during logout", error);
		}

		// Redirect to login
		throw redirect(302, "/login");
	},
};
