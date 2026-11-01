import { redirect } from "@sveltejs/kit";

/** v3.2 V6: budgets renamed to trends — old uncategorised links keep working. */
export const load = ({ params }: { params: { month: string } }) => {
	redirect(302, `/overview/trends/${params.month}/uncategorised`);
};
