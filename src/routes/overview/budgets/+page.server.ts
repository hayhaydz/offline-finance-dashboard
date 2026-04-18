import { redirect } from "@sveltejs/kit";
import { requireAuth } from "$lib/server/utils/auth-guard";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals);

	const now = new Date();
	const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	redirect(302, `/overview/budgets/${month}`);
};
