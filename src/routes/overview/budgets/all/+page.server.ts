import { redirect } from "@sveltejs/kit";
import { getBudgetHistory } from "$lib/server/budgets";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, "/login");

	const PAGE_SIZE = 24;
	const pageParam = Number(url.searchParams.get("page")) || 1;
	const page = Math.max(0, pageParam - 1);

	const history = await getBudgetHistory(locals.user.id, page, PAGE_SIZE);

	return {
		months: history.months,
		pagination: {
			page: history.pagination.page,
			totalPages: history.pagination.totalPages,
		},
	};
};
