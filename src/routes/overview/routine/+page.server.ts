import {
	calculateStreak,
	currentYearMonth,
	getReviewHistory,
} from "$lib/server/reviews";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { devLog } from "$lib/server/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const { id } = requireAuth(locals);

	const history = await getReviewHistory(id);
	const streak = calculateStreak(history);
	const thisMonth = currentYearMonth();

	devLog("review", "Loaded review index", {
		userId: id,
		historyCount: history.length,
		currentStreak: streak.currentStreak,
	});

	return {
		history,
		streak,
		thisMonth,
	};
};
