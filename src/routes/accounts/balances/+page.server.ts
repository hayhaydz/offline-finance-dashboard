import { fail } from "@sveltejs/kit";
import { and, eq, isNull } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts } from "$lib/db/schema";
import {
	getCurrentBalancesForAccounts,
	getLatestTransactionDateForAccounts,
} from "$lib/server/derivedBalances";
import { logFormData, logInfo } from "$lib/server/logger";
import { createTransaction } from "$lib/server/transactions";
import { getAuthUser, requireAuth } from "$lib/server/utils/auth-guard";
import { NEGATIVE_AMOUNT_TYPES } from "$lib/utils/domain-constants";
import { isStaleBalance, planReconciliation } from "$lib/utils/reconcile";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Bulk balance update (#16): every open account on one screen with its
 * derived balance + staleness flag. Entering a target balance appends a
 * reconciling transaction (balances are transaction-derived, never set).
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	const openAccounts = await db.query.accounts.findMany({
		where: and(withUserFilter(user.id, accounts), isNull(accounts.closedAt)),
		orderBy: (accs, { asc }) => [asc(accs.name)],
	});

	const ids = openAccounts.map((a) => a.id);
	const [balances, lastUpdated] = await Promise.all([
		getCurrentBalancesForAccounts(ids),
		getLatestTransactionDateForAccounts(ids),
	]);

	return {
		accounts: openAccounts.map((a) => ({
			id: a.id,
			slug: a.slug,
			name: a.name,
			type: a.type,
			category: a.category,
			currentBalance: balances.get(a.id) ?? 0,
			lastUpdated: lastUpdated.get(a.id) ?? null,
			stale: isStaleBalance(lastUpdated.get(a.id) ?? null),
		})),
		today: new Date().toISOString().slice(0, 10),
	};
};

export const actions: Actions = {
	update: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		logFormData("balances:update", formData);

		const dateStr = formData.get("balanceDate");
		const transactionDate = new Date(
			typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
				? dateStr
				: new Date().toISOString().slice(0, 10),
		);
		if (Number.isNaN(transactionDate.getTime())) {
			return fail(400, { error: "Invalid date" });
		}

		// Re-read the account list (balances may have drifted since load)
		const openAccounts = await db.query.accounts.findMany({
			where: and(withUserFilter(user.id, accounts), isNull(accounts.closedAt)),
			columns: { id: true, name: true, category: true },
		});
		const accountMap = new Map(openAccounts.map((a) => [a.id, a]));
		const balances = await getCurrentBalancesForAccounts([...accountMap.keys()]);

		let updated = 0;
		const errors: string[] = [];

		for (const [key, raw] of formData.entries()) {
			if (!key.startsWith("balance:") || typeof raw !== "string" || !raw.trim()) {
				continue;
			}
			const accountId = Number(key.slice("balance:".length));
			const account = accountMap.get(accountId);
			if (!account) continue; // not the user's — ignore silently

			const target = Math.round(parseFloat(raw) * 100);
			if (!Number.isFinite(target)) {
				errors.push(`${account.name}: not a number`);
				continue;
			}

			const delta = target - (balances.get(accountId) ?? 0);
			const plan = planReconciliation(account.category, delta);
			if (plan.kind === "skip") continue;

			const amount = NEGATIVE_AMOUNT_TYPES.includes(plan.type)
				? -plan.amountPence
				: plan.amountPence;

			const result = await createTransaction(
				{
					accountId,
					type: plan.type,
					amount,
					description: "Balance reconciliation (bulk update)",
					transactionDate,
				},
				{ ...account, userId: user.id } as Parameters<
					typeof createTransaction
				>[1],
			);
			if (!result.ok) {
				errors.push(`${account.name}: ${result.error}`);
				continue;
			}
			updated++;
		}

		logInfo("balances:update", "Bulk balance update", { updated, errors });

		if (errors.length > 0) {
			return fail(400, { error: errors.join(" · "), updated });
		}
		return { success: true, updated };
	},
};
