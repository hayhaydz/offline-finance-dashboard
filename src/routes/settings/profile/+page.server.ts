import { devLog } from "$lib/server/logger";
import { requireAuth } from "$lib/server/utils/auth-guard";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	devLog("profile", "Profile settings loaded", {
		username: user.username,
		userId: user.id,
	});

	return {
		user,
		session: locals.session,
	};
};
