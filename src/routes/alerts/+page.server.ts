import { redirect } from "@sveltejs/kit";
import { getAlerts } from "$lib/server/alerts";
import { sortAlerts } from "$lib/types/alerts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, "/auth/login");
	}

	const all = await getAlerts(locals.user.id);
	const sorted = sortAlerts(all);

	return {
		redAlerts:   sorted.filter((a) => a.severity === 'red'),
		amberAlerts: sorted.filter((a) => a.severity === 'amber'),
		infoAlerts:  sorted.filter((a) => a.severity === 'info'),
		total: all.length,
	};
};
