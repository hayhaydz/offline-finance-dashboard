import { getAlerts } from "$lib/server/alerts";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { sortAlerts } from "$lib/types/alerts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	const all = await getAlerts(user.id);
	const sorted = sortAlerts(all);

	return {
		redAlerts:   sorted.filter((a) => a.severity === 'red'),
		amberAlerts: sorted.filter((a) => a.severity === 'amber'),
		infoAlerts:  sorted.filter((a) => a.severity === 'info'),
		total: all.length,
	};
};
