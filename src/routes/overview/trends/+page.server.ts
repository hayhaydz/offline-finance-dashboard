import { redirect } from "@sveltejs/kit";
import { requireAuth } from "$lib/server/utils/auth-guard";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals);

	// v3.2 (2026-11-01 user steer): Trends lands on the Monzo-style
	// insights surface (balance / spending / target). The old budgets
	// month page is merged into the target tab — old paths still resolve
	// (see [month]/+page.server.ts redirect).
	redirect(302, "/overview/trends/insights");
};
