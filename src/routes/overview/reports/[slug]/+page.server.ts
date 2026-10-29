import { error } from "@sveltejs/kit";
import { findReport } from "$lib/server/reports-v2";
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
	return { report };
};
