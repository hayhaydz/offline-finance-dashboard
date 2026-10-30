import { error } from "@sveltejs/kit";
import { REPORTS, findReport } from "$lib/server/reports-v2";
import { requireAuth } from "$lib/server/utils/auth-guard";
import type { PageServerLoad } from "./$types";

/**
 * Reports v2 (R10): a single dated report, built on demand from the
 * registry. The document structure (abstract/method/findings) is the
 * science-paper format; rendering stays terminal aesthetic.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const user = requireAuth(locals);
	const definition = findReport(params.slug);
	if (!definition) {
		error(404, "No such report");
	}
	const report = await definition.build(user.id);

	// R-H12: prev/next by registry order — dated-series reading nav
	const idx = REPORTS.findIndex((d) => d.slug === definition.slug);
	const prev = idx > 0 ? REPORTS[idx - 1] : undefined;
	const next = idx >= 0 && idx < REPORTS.length - 1 ? REPORTS[idx + 1] : undefined;

	return {
		report,
		siblings: {
			prev: prev ? { slug: prev.slug, title: prev.title } : null,
			next: next ? { slug: next.slug, title: next.title } : null,
		},
	};
};
