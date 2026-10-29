import type { PageServerLoad } from "./$types";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { getToolsData } from "$lib/server/tools";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	// The index needs only the context line (band/PSA/tax year), but the
	// loader is cheap and shared with the sub-pages.
	return await getToolsData(user.id);
};
