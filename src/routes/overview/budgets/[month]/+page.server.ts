import { fail, redirect } from "@sveltejs/kit";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accounts, spendingCategories } from "$lib/db/schema";
import { parseCurrency } from "$lib/utils/currency";
import { logFormData } from "$lib/server/logger";
import {
	getBudgetStatus,
	getCategoryBreakdown,
	getBudgetHistory,
	getBudgetRow,
	saveBudgetRow,
	UNCATEGORISED_ID,
} from "$lib/server/budgets";
import type { Actions, PageServerLoad } from "./$types";

function parseMonthSlug(slug: string): { year: number; month: number } | null {
	const match = slug.match(/^(\d{4})-(\d{2})$/);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	if (month < 1 || month > 12) return null;
	return { year, month };
}

function getCurrentMonthStr(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) redirect(302, "/login");

	const parsed = parseMonthSlug(params.month);
	if (!parsed) redirect(302, "/overview/budgets");

	const { year, month } = parsed;
	const monthStr = `${year}-${String(month).padStart(2, "0")}`;
	const isCurrentMonth = monthStr === getCurrentMonthStr();

	const status = await getBudgetStatus(locals.user.id, year, month);

	const categoryBreakdown = await getCategoryBreakdown(
		locals.user.id,
		year,
		month,
		status.budget,
	);

	const historyPage = Math.max(0, Number(url.searchParams.get("page") ?? "1") - 1);
	const history = await getBudgetHistory(locals.user.id, historyPage);

	const categories = await db.query.spendingCategories.findMany({
		where: and(
			eq(spendingCategories.userId, locals.user.id),
			isNull(spendingCategories.deletedAt),
		),
		orderBy: (cats, { asc }) => [asc(cats.name)],
	});

	const allAccounts = await db.query.accounts.findMany({
		where: and(
			eq(accounts.userId, locals.user.id),
			isNull(accounts.closedAt),
		),
		orderBy: (accs, { asc }) => [asc(accs.name)],
	});

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
	};
};

export const actions: Actions = {
	saveTarget: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: "Unauthorized" });

		const parsed = parseMonthSlug(params.month);
		if (!parsed) return fail(400, { error: "Invalid month" });

		const monthStr = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
		if (monthStr !== getCurrentMonthStr()) {
			return fail(403, { error: "Cannot edit historical months" });
		}

		const formData = await request.formData();
		logFormData("saveTarget", formData);

		const amountStr = formData.get("amount") as string;
		if (!amountStr) return fail(400, { error: "Amount is required" });

		try {
			const amountInCents = parseCurrency(amountStr);
			if (amountInCents <= 0) {
				return fail(400, { error: "Amount must be positive" });
			}

			const row = await getBudgetRow(locals.user.id, monthStr);
			const existingTargets = row
				? JSON.parse(row.categoryTargets) as Record<string, number>
				: {};

			await saveBudgetRow(locals.user.id, monthStr, {
				totalTargetInCents: amountInCents,
				categoryTargets: JSON.stringify(existingTargets),
			});

			return { success: true };
		} catch {
			return fail(400, { error: "Invalid amount format" });
		}
	},

	saveCategoryTarget: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: "Unauthorized" });

		const parsed = parseMonthSlug(params.month);
		if (!parsed) return fail(400, { error: "Invalid month" });

		const monthStr = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
		if (monthStr !== getCurrentMonthStr()) {
			return fail(403, { error: "Cannot edit historical months" });
		}

		const formData = await request.formData();
		logFormData("saveCategoryTarget", formData);

		const categoryId = Number(formData.get("categoryId"));
		const amountStr = formData.get("amount") as string;

		if (!categoryId || Number.isNaN(categoryId)) {
			return fail(400, { error: "Invalid category" });
		}

		const row = await getBudgetRow(locals.user.id, monthStr);
		if (!row) return fail(400, { error: "No budget set for this month" });

		const targets = JSON.parse(row.categoryTargets) as Record<string, number>;

		if (amountStr && amountStr !== "0") {
			try {
				const amountInCents = parseCurrency(amountStr);
				if (amountInCents <= 0) {
					return fail(400, { error: "Amount must be positive" });
				}
				targets[String(categoryId)] = amountInCents;
			} catch {
				return fail(400, { error: "Invalid amount format" });
			}
		} else {
			delete targets[String(categoryId)];
		}

		const totalTarget = Object.values(targets).reduce((sum, v) => sum + v, 0);

		await saveBudgetRow(locals.user.id, monthStr, {
			totalTargetInCents: totalTarget,
			categoryTargets: JSON.stringify(targets),
		});

		return { success: true };
	},

	toggleCategory: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: "Unauthorized" });

		const parsed = parseMonthSlug(params.month);
		if (!parsed) return fail(400, { error: "Invalid month" });

		const monthStr = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
		if (monthStr !== getCurrentMonthStr()) {
			return fail(403, { error: "Cannot edit historical months" });
		}

		const formData = await request.formData();
		const categoryId = Number(formData.get("categoryId"));
		const included = formData.get("included") === "true";

		if (!categoryId || Number.isNaN(categoryId)) {
			return fail(400, { error: "Invalid category" });
		}

		if (categoryId === UNCATEGORISED_ID) {
			return fail(400, { error: "Cannot exclude uncategorised" });
		}

		const row = await getBudgetRow(locals.user.id, monthStr);
		if (!row) return fail(400, { error: "No budget set" });

		const excluded = JSON.parse(row.excludedCategoryIds) as number[];
		const targets = JSON.parse(row.categoryTargets) as Record<string, number>;

		if (included) {
			const idx = excluded.indexOf(categoryId);
			if (idx !== -1) excluded.splice(idx, 1);
		} else {
			if (!excluded.includes(categoryId)) excluded.push(categoryId);
			delete targets[String(categoryId)];
		}

		const totalTarget = Object.values(targets).reduce((sum, v) => sum + v, 0);

		await saveBudgetRow(locals.user.id, monthStr, {
			excludedCategoryIds: JSON.stringify(excluded),
			categoryTargets: JSON.stringify(targets),
			totalTargetInCents: totalTarget,
		});

		return { success: true };
	},

	toggleAccount: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: "Unauthorized" });

		const parsed = parseMonthSlug(params.month);
		if (!parsed) return fail(400, { error: "Invalid month" });

		const monthStr = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
		if (monthStr !== getCurrentMonthStr()) {
			return fail(403, { error: "Cannot edit historical months" });
		}

		const formData = await request.formData();
		const accountId = Number(formData.get("accountId"));
		const included = formData.get("included") === "true";

		if (!accountId || Number.isNaN(accountId)) {
			return fail(400, { error: "Invalid account" });
		}

		const row = await getBudgetRow(locals.user.id, monthStr);
		if (!row) return fail(400, { error: "No budget set" });

		const excluded = JSON.parse(row.excludedAccountIds) as number[];

		if (included) {
			const idx = excluded.indexOf(accountId);
			if (idx !== -1) excluded.splice(idx, 1);
		} else {
			if (!excluded.includes(accountId)) excluded.push(accountId);
		}

		await saveBudgetRow(locals.user.id, monthStr, {
			excludedAccountIds: JSON.stringify(excluded),
		});

		return { success: true };
	},
};
