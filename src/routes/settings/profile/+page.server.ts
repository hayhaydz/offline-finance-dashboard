import { devLog, isVerboseDebug } from "$lib/server/logger";
import { requireAuth, userDto } from "$lib/server/utils/auth-guard";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	if (isVerboseDebug()) {
		devLog("profile", "Profile settings loaded", {
			username: user.username,
			userId: user.id,
		});
	}

	// Session DTO: non-secret timing fields only — the raw session row
	// carries the live token and must never reach the browser.
	return {
		user: userDto(user),
		session: locals.session
			? {
					createdAt: locals.session.createdAt,
					lastActivity: locals.session.lastActivity,
				}
			: null,
	};
};
