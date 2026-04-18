import {
	calculateStreak,
	currentYearMonth,
	getReviewHistory,
} from "$lib/server/reviews";
import { requireAuth } from "$lib/server/utils/auth-guard";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const { id } = requireAuth(locals);

	const history = await getReviewHistory(id);
	const streak = calculateStreak(history);
	const thisMonth = currentYearMonth();

	return {
		history,
		streak,
		thisMonth,
	};
};
