import { redirect } from "@sveltejs/kit";
import {
	calculateStreak,
	currentYearMonth,
	getReviewHistory,
} from "$lib/server/reviews";
import { devLog } from "$lib/utils/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		devLog("review", "Unauthenticated user, redirecting to login");
		redirect(302, "/login");
	}

	const history = await getReviewHistory(locals.user.id);
	const streak = calculateStreak(history);
	const thisMonth = currentYearMonth();

	devLog("review", "Loaded review index", {
		userId: locals.user.id,
		historyCount: history.length,
		currentStreak: streak.currentStreak,
	});

	return {
		history,
		streak,
		thisMonth,
	};
};
