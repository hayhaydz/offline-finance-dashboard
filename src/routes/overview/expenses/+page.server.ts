import { fail } from "@sveltejs/kit";
import {
	getExpensesGrid,
	getLatestMonthlyExpenses,
	rangeFill,
	removeMonth,
	upsertMonth,
} from "$lib/server/expenses-history";
import { devLog, logFormData } from "$lib/server/logger";
import { getAuthUser, requireAuth } from "$lib/server/utils/auth-guard";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);
	return {
		grid: await getExpensesGrid(user.id),
		latest: await getLatestMonthlyExpenses(user.id),
	};
};

export const actions: Actions = {
	/** Save (upsert) a single month. £0 is valid and distinct from missing. */
	saveMonth: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		logFormData("expenses-history:saveMonth", Object.fromEntries(formData));

		const month = (formData.get("month") as string)?.trim() ?? "";
		const amountInput = (formData.get("amount") as string)?.trim() ?? "";
		const note = (formData.get("note") as string)?.trim() ?? null;

		const result = await upsertMonth(user.id, month, amountInput, note);
		if (!result.ok) return fail(400, { error: result.error });
		return { success: true, message: result.message };
	},

	/** Remove a single month's entry (the month becomes unknown, not £0). */
	removeMonth: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		const month = (formData.get("month") as string)?.trim() ?? "";

		const result = await removeMonth(user.id, month);
		if (!result.ok) return fail(400, { error: result.error });
		return { success: true, message: result.message };
	},

	/**
	 * Range-fill: write a fixed £/mo to every month in [from, to].
	 * Existing entries are overwritten only after an explicit confirmation
	 * naming the count.
	 */
	rangeFill: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		logFormData("expenses-history:rangeFill", Object.fromEntries(formData));

		const fromMonth = (formData.get("fromMonth") as string)?.trim() ?? "";
		const toMonth = (formData.get("toMonth") as string)?.trim() ?? "";
		const amountInput = (formData.get("amount") as string)?.trim() ?? "";
		const confirmed = formData.get("confirmed") === "yes";

		const result = await rangeFill(
			user.id,
			fromMonth,
			toMonth,
			amountInput,
			confirmed,
		);

		if (!result.ok && "confirmRangeFill" in result) {
			return fail(400, {
				error: "confirm",
				confirmRangeFill: result.confirmRangeFill,
			});
		}
		if (!result.ok) return fail(400, { error: result.error });

		devLog("expenses-history:rangeFill", "Action complete", {
			userId: user.id,
		});
		return { success: true, message: result.message };
	},
};
