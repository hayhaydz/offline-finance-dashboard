import { redirect } from "@sveltejs/kit";
import { getUkTaxYearBounds } from "$lib/server/calculations";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, "/login");

	const bounds = getUkTaxYearBounds(new Date());
	const startYear = bounds.start.getUTCFullYear();
	const endYear = bounds.end.getUTCFullYear();
	const slug = `${startYear}-${String(endYear).slice(-2)}`;

	redirect(302, `/accounts/interest/${slug}`);
};
