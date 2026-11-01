import { redirect } from "@sveltejs/kit";

/** v3.2 V6: budgets renamed to trends — the yearly overview moved too. */
export const load = () => {
	redirect(302, "/overview/trends/all");
};
