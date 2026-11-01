/**
 * v3.2 V4 (2026-11-01): the four trends config form actions, lifted out of
 * the month route so the dedicated /overview/trends/[month]/config page can
 * own them (user direction — config + amendments live on their own page).
 * Signatures are route-agnostic: both the month route and the config route
 * sit under [month], so params.month resolves identically.
 */
import { fail } from "@sveltejs/kit";
import type { Actions } from "@sveltejs/kit";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accounts } from "$lib/db/schema";
import {
	amendBudgetConfig,
	saveBudgetRow,
	UNCATEGORISED_ID,
} from "$lib/server/budgets";
import { logFormData } from "$lib/server/logger";
import { getAuthUser } from "$lib/server/utils/auth-guard";
import { parseCurrency } from "$lib/utils/currency";
import {
	BUDGET_SPENDING_TYPES,
	TRANSACTION_TYPES,
	type TransactionType,
} from "$lib/utils/domain-constants";

export function parseMonthSlug(slug: string): { year: number; month: number } | null {
	const match = slug.match(/^(\d{4})-(\d{2})$/);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	if (month < 1 || month > 12) return null;
	return { year, month };
}

/** Shared amendment options on every config form: optional note + forward-apply. */
export function parseFormOptions(formData: FormData): {
	note: string | null;
	applyForward: boolean;
} {
	const note = formData.get("note");
	return {
		note: typeof note === "string" && note.trim() ? note : null,
		applyForward: formData.get("applyForward") === "true",
	};
}

function monthStrFromParams(params: Record<string, string>): string | null {
	const parsed = parseMonthSlug(params.month ?? "");
	if (!parsed) return null;
	return `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
}

export const trendsConfigActions = {
	saveTarget: async ({ request, locals, params }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Unauthorized" });

		const monthStr = monthStrFromParams(params);
		if (!monthStr) return fail(400, { error: "Invalid month" });

		const formData = await request.formData();
		logFormData("saveTarget", formData);
		const { note } = parseFormOptions(formData);

		const amountStr = formData.get("amount") as string;
		if (!amountStr) return fail(400, { error: "Amount is required" });

		let amountInCents: number;
		try {
			amountInCents = parseCurrency(amountStr);
		} catch {
			return fail(400, { error: "Invalid amount format" });
		}
		if (amountInCents <= 0) {
			return fail(400, { error: "Amount must be positive" });
		}

		// Scoping step (task 3.1): explicit "all accounts" or a selection.
		// Nothing chosen is an error, never a silent all-accounts default.
		const allAccounts = formData.get("allAccounts") === "on";
		const selectedIds = formData
			.getAll("accountIds")
			.map((v) => Number(v))
			.filter((v) => !Number.isNaN(v));

		let excludedAccountIds: number[] = [];
		if (!allAccounts) {
			if (selectedIds.length === 0) {
				return fail(400, {
					error: "Choose accounts for this budget or tick All accounts",
				});
			}
			const openAccounts = await db.query.accounts.findMany({
				where: and(eq(accounts.userId, user.id), isNull(accounts.closedAt)),
				columns: { id: true },
			});
			excludedAccountIds = openAccounts
				.map((a) => a.id)
				.filter((id) => !selectedIds.includes(id));
		}

		await saveBudgetRow(
			user.id,
			monthStr,
			{
				totalTargetInCents: amountInCents,
				excludedAccountIds,
			},
			{ note },
		);

		return { success: true };
	},

	saveCategoryTarget: async ({ request, locals, params }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Unauthorized" });

		const monthStr = monthStrFromParams(params);
		if (!monthStr) return fail(400, { error: "Invalid month" });

		const formData = await request.formData();
		logFormData("saveCategoryTarget", formData);
		const { note, applyForward } = parseFormOptions(formData);

		const categoryId = Number(formData.get("categoryId"));
		const amountStr = formData.get("amount") as string;

		if (!categoryId || Number.isNaN(categoryId)) {
			return fail(400, { error: "Invalid category" });
		}

		let amountInCents: number | null = null;
		if (amountStr && amountStr !== "0") {
			try {
				amountInCents = parseCurrency(amountStr);
			} catch {
				return fail(400, { error: "Invalid amount format" });
			}
			if (amountInCents <= 0) {
				return fail(400, { error: "Amount must be positive" });
			}
		}

		const result = await amendBudgetConfig(
			user.id,
			monthStr,
			(row) => {
				const targets = { ...row.categoryTargets };
				if (amountInCents === null) {
					delete targets[String(categoryId)];
				} else {
					targets[String(categoryId)] = amountInCents;
				}
				return {
					categoryTargets: targets,
					totalTargetInCents: Object.values(targets).reduce(
						(sum, v) => sum + v,
						0,
					),
				};
			},
			{ note, applyForward },
		);

		if (!result.ok) return fail(400, { error: result.error });
		return { success: true, monthsChanged: result.monthsChanged };
	},

	toggleCategory: async ({ request, locals, params }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Unauthorized" });

		const monthStr = monthStrFromParams(params);
		if (!monthStr) return fail(400, { error: "Invalid month" });

		const formData = await request.formData();
		const categoryId = Number(formData.get("categoryId"));
		const included = formData.get("included") === "true";
		const { note, applyForward } = parseFormOptions(formData);

		if (!categoryId || Number.isNaN(categoryId)) {
			return fail(400, { error: "Invalid category" });
		}

		if (categoryId === UNCATEGORISED_ID) {
			return fail(400, { error: "Cannot exclude uncategorised" });
		}

		const result = await amendBudgetConfig(
			user.id,
			monthStr,
			(row) => {
				const excluded = [...row.excludedCategoryIds];
				const targets = { ...row.categoryTargets };

				if (included) {
					const idx = excluded.indexOf(categoryId);
					if (idx !== -1) excluded.splice(idx, 1);
				} else {
					if (!excluded.includes(categoryId)) excluded.push(categoryId);
					delete targets[String(categoryId)];
				}

				return {
					excludedCategoryIds: excluded,
					categoryTargets: targets,
					totalTargetInCents: Object.values(targets).reduce(
						(sum, v) => sum + v,
						0,
					),
				};
			},
			{ note, applyForward },
		);

		if (!result.ok) return fail(400, { error: result.error });
		return { success: true, monthsChanged: result.monthsChanged };
	},

	toggleAccount: async ({ request, locals, params }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Unauthorized" });

		const monthStr = monthStrFromParams(params);
		if (!monthStr) return fail(400, { error: "Invalid month" });

		const formData = await request.formData();
		const accountId = Number(formData.get("accountId"));
		const included = formData.get("included") === "true";
		const { note, applyForward } = parseFormOptions(formData);

		if (!accountId || Number.isNaN(accountId)) {
			return fail(400, { error: "Invalid account" });
		}

		const result = await amendBudgetConfig(
			user.id,
			monthStr,
			(row) => {
				const excluded = [...row.excludedAccountIds];
				if (included) {
					const idx = excluded.indexOf(accountId);
					if (idx !== -1) excluded.splice(idx, 1);
				} else {
					if (!excluded.includes(accountId)) excluded.push(accountId);
				}
				return { excludedAccountIds: excluded };
			},
			{ note, applyForward },
		);

		if (!result.ok) return fail(400, { error: result.error });
		return { success: true, monthsChanged: result.monthsChanged };
	},

	toggleType: async ({ request, locals, params }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Unauthorized" });

		const monthStr = monthStrFromParams(params);
		if (!monthStr) return fail(400, { error: "Invalid month" });

		const formData = await request.formData();
		const typeStr = String(formData.get("type") ?? "");
		const included = formData.get("included") === "true";
		const { note, applyForward } = parseFormOptions(formData);

		if (!TRANSACTION_TYPES.includes(typeStr as TransactionType)) {
			return fail(400, { error: "Invalid transaction type" });
		}
		if (!BUDGET_SPENDING_TYPES.includes(typeStr as TransactionType)) {
			return fail(400, {
				error: "Type is not part of the budget spending definition",
			});
		}

		const result = await amendBudgetConfig(
			user.id,
			monthStr,
			(row) => {
				const excluded = [...row.excludedTypes];
				if (included) {
					const idx = excluded.indexOf(typeStr as TransactionType);
					if (idx !== -1) excluded.splice(idx, 1);
				} else {
					if (!excluded.includes(typeStr as TransactionType)) {
						excluded.push(typeStr as TransactionType);
					}
				}
				return { excludedTypes: excluded };
			},
			{ note, applyForward },
		);

		if (!result.ok) return fail(400, { error: result.error });
		return { success: true, monthsChanged: result.monthsChanged };
	},
} satisfies Actions;
