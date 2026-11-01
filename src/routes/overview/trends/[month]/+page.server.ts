import { redirect } from "@sveltejs/kit";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accounts, spendingCategories } from "$lib/db/schema";
import {
	getBudgetHistory,
	getBudgetStatus,
	getCategoryBreakdown,
	getCumulativeDailySpend,
	getMonthAmendments,
} from "$lib/server/budgets";
import { parseMonthSlug } from "$lib/server/trends-config-actions";
import { requireAuth } from "$lib/server/utils/auth-guard";
import type { PageServerLoad } from "./$types";

// v3.2 V4 (2026-11-01): the four config actions moved to the dedicated
// /overview/trends/[month]/config page ($lib/server/trends-config-actions).
// This route is now read-only — the month page shows the analysis; config
// + amendments live behind the [Config & amendments] header link.

function getCurrentMonthStr(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
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

	const historyPage = Math.max(
		0,
		Number(url.searchParams.get("page") ?? "1") - 1,
	);
	const history = await getBudgetHistory(user.id, historyPage);

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

	// Phase 4 V1 #2: cumulative daily spend for the burn-down chart
	const burnDown = await getCumulativeDailySpend(
		user.id,
		year,
		month,
		status.budget,
	);

	return {
		budget: status.budget,
		status: {
			totalSpent: status.totalSpent,
			daysElapsed: status.daysElapsed,
			totalDays: status.totalDays,
			avgPerDay: status.avgPerDay,
			projectedTotal: status.projectedTotal,
		},
		categoryBreakdown,
		history,
		categories,
		accounts: allAccounts,
		selectedMonth: monthStr,
		isCurrentMonth,
		amendments,
		burnDown,
	};
};
