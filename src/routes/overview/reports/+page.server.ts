import type { PageServerLoad } from "./$types";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { REPORTS } from "$lib/server/reports-v2";

/**
 * Reports v2 index (R10): a dated list of focused reports — news-article
 * style. Each entry names the question it asks; the report pages carry
 * the science-paper structure.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	// The index itself is cheap: definitions + today's date. Each report
	// is built on demand by its own page.
	return {
		reports: REPORTS.map((report) => ({
			slug: report.slug,
			title: report.title,
			blurb: report.blurb,
		})),
		today: new Date().toISOString().slice(0, 10),
	};
};
