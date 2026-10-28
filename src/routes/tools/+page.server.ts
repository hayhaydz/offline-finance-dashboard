import type { PageServerLoad } from "./$types";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { getToolsData } from "$lib/server/tools";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	// Phase 6: one typed loader — balances, effective rates, band, PSA,
	// debt minimums and the taxable-interest forecast, all from the
	// existing engines. The client (utils/tool-math.ts) runs scenarios.
	return await getToolsData(user.id);
};
