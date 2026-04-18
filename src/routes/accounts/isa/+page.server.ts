import { redirect } from "@sveltejs/kit";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { getUkTaxYearBounds } from "$lib/utils/tax-year-utils";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	requireAuth(locals);

	const bounds = getUkTaxYearBounds(new Date());
	const startYear = bounds.start.getUTCFullYear();
	const endYear = bounds.end.getUTCFullYear();
	const slug = `${startYear}-${String(endYear).slice(-2)}`;

	redirect(302, `/accounts/isa/${slug}`);
};
