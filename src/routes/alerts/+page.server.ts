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

	// Split user-level vs account-level
	const userAlerts = sorted.filter((a) => !a.accountSlug);
	const accountAlerts = sorted.filter((a) => !!a.accountSlug);

	// Group account alerts by accountSlug
	const groupMap = new Map<string, { name: string; alerts: typeof accountAlerts }>();
	for (const alert of accountAlerts) {
		const slug = alert.accountSlug!;
		if (!groupMap.has(slug)) {
			groupMap.set(slug, { name: alert.accountName ?? slug, alerts: [] });
		}
		groupMap.get(slug)!.alerts.push(alert);
	}

	// Sort groups: worst severity first
	const severityRank = (group: { alerts: typeof accountAlerts }) => {
		if (group.alerts.some((a) => a.severity === 'red')) return 0;
		if (group.alerts.some((a) => a.severity === 'amber')) return 1;
		return 2;
	};

	const accountGroups = Array.from(groupMap.entries())
		.map(([slug, group]) => ({ slug, name: group.name, alerts: group.alerts }))
		.sort((a, b) => severityRank(a) - severityRank(b));

	return {
		userAlerts,
		accountGroups,
		total: all.length,
	};
};
