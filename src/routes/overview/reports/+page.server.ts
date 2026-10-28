import type { PageServerLoad } from "./$types";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { getNetWorthHistory } from "$lib/server/reports";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	// Phase 4 V1 #1: net worth history (typed) for the Reports landing chart.
	// Phase 5 layers the remaining reports (spending, interest, debt) here.
	const netWorthHistory = await getNetWorthHistory(user.id);

	return { netWorthHistory };
};
