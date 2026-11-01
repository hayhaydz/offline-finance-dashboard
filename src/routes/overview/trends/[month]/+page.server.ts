import { redirect } from "@sveltejs/kit";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { parseMonthSlug } from "$lib/server/trends-config-actions";
import type { PageServerLoad } from "./$types";

// v3.2 (2026-11-01 user steer): the old budgets month page is MERGED into
// the insights TARGET tab (the old surface was always closest to "target").
// This route now redirects; the /config and /uncategorised sub-routes and
// every old bookmark keep resolving through it.
export const load: PageServerLoad = async ({ locals, params }) => {
	requireAuth(locals);

	const parsed = parseMonthSlug(params.month);
	if (!parsed) redirect(302, "/overview/trends/insights");

	redirect(302, `/overview/trends/insights?month=${params.month}`);
};
