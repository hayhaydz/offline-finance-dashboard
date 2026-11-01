import { redirect } from "@sveltejs/kit";

/** v3.2 V6: budgets renamed to trends — old links 302 to the new home. */
export const load = () => {
	redirect(302, "/overview/trends");
};
