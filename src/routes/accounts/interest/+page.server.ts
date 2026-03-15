import { redirect } from "@sveltejs/kit";
import { getUkTaxYearBounds } from "$lib/server/calculations";

export const load = async () => {
	const taxYear = getUkTaxYearBounds(new Date());
	const yearStr = `${taxYear.start.getUTCFullYear()}-${String(taxYear.end.getUTCFullYear()).slice(-2)}`;
	redirect(302, `/accounts/interest/${yearStr}`);
};
