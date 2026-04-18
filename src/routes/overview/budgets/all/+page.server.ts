import { getBudgetHistory } from "$lib/server/budgets";
import { requireAuth } from "$lib/server/utils/auth-guard";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
	const { id } = requireAuth(locals);

	const PAGE_SIZE = 24;
	const pageParam = Number(url.searchParams.get("page")) || 1;
	const page = Math.max(0, pageParam - 1);

	const history = await getBudgetHistory(id, page, PAGE_SIZE);

	return {
		months: history.months,
		pagination: {
			page: history.pagination.page,
			totalPages: history.pagination.totalPages,
		},
	};
};
