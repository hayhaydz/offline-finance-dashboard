import { getAmendmentTimeline, getBudgetHistory } from "$lib/server/budgets";
import { requireAuth } from "$lib/server/utils/auth-guard";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
	const { id } = requireAuth(locals);

	const PAGE_SIZE = 24;
	const pageParam = Number(url.searchParams.get("page")) || 1;
	const page = Math.max(0, pageParam - 1);

	const history = await getBudgetHistory(id, page, PAGE_SIZE);
	const amendmentTimeline = await getAmendmentTimeline(id);

	// v3.1 row 37: yearly overview — every recorded month (budget months
	// are bounded: one row per month the user has configured), grouped by
	// year for the met/over visual.
	const all = await getBudgetHistory(id, 0, 1200);
	const byYear = new Map<string, Array<{ month: string; totalTarget: number; actualSpent: number }>>();
	for (const m of all.months) {
		const year = m.month.split("-")[0];
		const list = byYear.get(year) ?? [];
		list.push({ month: m.month, totalTarget: m.totalTarget, actualSpent: m.actualSpent });
		byYear.set(year, list);
	}
	const years = [...byYear.entries()]
		.sort((a, b) => Number(b[0]) - Number(a[0]))
		.map(([year, months]) => ({ year, months: months.sort((a, b) => a.month.localeCompare(b.month)) }));

	return {
		months: history.months,
		pagination: {
			page: history.pagination.page,
			totalPages: history.pagination.totalPages,
		},
		amendmentTimeline,
		years,
	};
};
