import type { PageServerLoad } from "./$types";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { getMonthlySpend, getNetWorthHistory } from "$lib/server/reports";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	// Phase 4 V1 #1: net worth history (typed) for the Reports landing chart.
	// Phase 5 line 2: last 6 months of category spend for the monthly charts.
	const [netWorthHistory, monthlySpend] = await Promise.all([
		getNetWorthHistory(user.id),
		getMonthlySpend(user.id, 6),
	]);

	return { netWorthHistory, monthlySpend };
};
