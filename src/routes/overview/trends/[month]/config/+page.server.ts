import { redirect } from "@sveltejs/kit";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accounts, spendingCategories } from "$lib/db/schema";
import {
	getBudgetStatus,
	getCategoryBreakdown,
	getMonthAmendments,
} from "$lib/server/budgets";
import {
	parseMonthSlug,
	trendsConfigActions,
} from "$lib/server/trends-config-actions";
import { requireAuth } from "$lib/server/utils/auth-guard";
import type { Actions, PageServerLoad } from "./$types";

// v3.2 V4 (2026-11-01): the dedicated config page for a trend month —
// target, category targets, filters, amendment options and the amendment
// log all live HERE (user direction), leaving the month page pure analysis.

function getCurrentMonthStr(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = requireAuth(locals);

	const parsed = parseMonthSlug(params.month);
	if (!parsed) redirect(302, "/overview/trends");

	const { year, month } = parsed;
	const monthStr = `${year}-${String(month).padStart(2, "0")}`;
	const isCurrentMonth = monthStr === getCurrentMonthStr();

	const status = await getBudgetStatus(user.id, year, month);
	const categoryBreakdown = await getCategoryBreakdown(
		user.id,
		year,
		month,
		status.budget,
	);

	const categories = await db.query.spendingCategories.findMany({
		where: and(
			eq(spendingCategories.userId, user.id),
			isNull(spendingCategories.deletedAt),
		),
		orderBy: (cats, { asc }) => [asc(cats.name)],
	});

	const allAccounts = await db.query.accounts.findMany({
		where: and(eq(accounts.userId, user.id), isNull(accounts.closedAt)),
		orderBy: (accs, { asc }) => [asc(accs.name)],
	});

	const amendments = await getMonthAmendments(user.id, monthStr);

	return {
		budget: status.budget,
		totalSpent: status.totalSpent,
		categoryBreakdown,
		categories,
		accounts: allAccounts,
		selectedMonth: monthStr,
		isCurrentMonth,
		amendments,
	};
};

export const actions: Actions = trendsConfigActions;
