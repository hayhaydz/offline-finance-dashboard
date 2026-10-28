import type { PageServerLoad } from "./$types";
import { requireAuth } from "$lib/server/utils/auth-guard";
import {
	getDebtReport,
	getInterestReport,
	getMonthlySpend,
	getNetWorthHistory,
} from "$lib/server/reports";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	// Phase 4 V1 #1: net worth history (typed) for the Reports landing chart.
	// Phase 5 line 2: last 6 months of category spend + interest + debt reports.
	const [netWorthHistory, monthlySpend, interestReport, debtReport] =
		await Promise.all([
			getNetWorthHistory(user.id),
			getMonthlySpend(user.id, 6),
			getInterestReport(user.id),
			getDebtReport(user.id),
		]);

	return { netWorthHistory, monthlySpend, interestReport, debtReport };
};
