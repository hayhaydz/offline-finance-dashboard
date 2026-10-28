import { fail, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accounts, accountTransactions } from "$lib/db/schema";
import { withUserFilter } from "$lib/auth/row-security";
import { getCategories } from "$lib/server/categories";
import {
	getBudgetStatus,
	getUncategorisedTransactions,
} from "$lib/server/budgets";
import { logFormData, logInfo } from "$lib/server/logger";
import { getAuthUser, requireAuth } from "$lib/server/utils/auth-guard";
import type { Actions, PageServerLoad } from "./$types";

function parseMonthSlug(slug: string): { year: number; month: number } | null {
	const match = slug.match(/^(\d{4})-(\d{2})$/);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	if (month < 1 || month > 12) return null;
	return { year, month };
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = requireAuth(locals);

	const parsed = parseMonthSlug(params.month);
	if (!parsed) redirect(302, "/overview/budgets");

	const { year, month } = parsed;
	const status = await getBudgetStatus(user.id, year, month);
	const [transactions, categories] = await Promise.all([
		getUncategorisedTransactions(user.id, year, month, status.budget),
		getCategories(user.id),
	]);

	const totalSpent = transactions.reduce((sum, tx) => {
		if (tx.type === "refund") return sum - Math.abs(tx.amount);
		return sum + Math.abs(tx.amount);
	}, 0);

	return {
		month: params.month,
		transactions,
		categories,
		totalSpent,
	};
};

export const actions: Actions = {
	/**
	 * Tag one uncategorised transaction with a category (#15 triage).
	 * Only categoryId is mutated — amount/date/description stay immutable.
	 */
	tag: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		logFormData("budgets-uncategorised:tag", formData);

		const transactionSlug = formData.get("transactionSlug");
		const categoryId = Number(formData.get("categoryId"));
		if (typeof transactionSlug !== "string" || !transactionSlug) {
			return fail(400, { error: "Missing transaction" });
		}
		if (!categoryId || Number.isNaN(categoryId)) {
			return fail(400, { error: "Choose a category first" });
		}

		// Verify the category belongs to this user.
		const category = await getCategories(user.id);
		if (!category.some((c) => c.id === categoryId)) {
			return fail(400, { error: "Unknown category" });
		}

		// Verify the transaction belongs to this user (via its account).
		const tx = await db
			.select({ id: accountTransactions.id, accountId: accountTransactions.accountId })
			.from(accountTransactions)
			.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
			.where(
				and(
					eq(accountTransactions.slug, transactionSlug),
					withUserFilter(user.id, accounts),
				),
			)
			.limit(1);

		if (tx.length === 0) {
			return fail(404, { error: "Transaction not found" });
		}

		db.update(accountTransactions)
			.set({ categoryId })
			.where(
				and(
					eq(accountTransactions.id, tx[0].id),
					eq(accountTransactions.accountId, tx[0].accountId),
				),
			)
			.run();

		logInfo("budgets-uncategorised:tag", "Transaction tagged", {
			transactionSlug,
			categoryId,
		});

		return { success: true };
	},
};
