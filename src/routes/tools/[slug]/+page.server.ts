import { error } from "@sveltejs/kit";
import { and, desc, eq, sql } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, accountTransactions } from "$lib/db/schema";
import { getNetWorthHistory } from "$lib/server/reports";
import { getToolsData } from "$lib/server/tools";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { findTool } from "$lib/utils/tool-registry";
import type { PageServerLoad } from "./$types";

/**
 * Tool sub-page (R13): every tool gets its own page with full-width
 * detail. Data is assembled per tool — the shared tools payload plus
 * whatever the specific tool needs (credit cards for the stooze
 * calculator, net-worth history for the milestone projector).
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const user = requireAuth(locals);
	const tool = findTool(params.slug);
	if (!tool) {
		error(404, "No such tool");
	}

	const data = await getToolsData(user.id);

	let cards: {
		slug: string;
		name: string;
		outstandingPence: number;
		promoEndsAt: string | null;
		revertAprBasisPoints: number | null;
		creditMode: string | null;
	}[] = [];
	if (tool.slug === "stooze") {
		const creditCards = await db
			.select({
				id: accounts.id,
				slug: accounts.slug,
				name: accounts.name,
				creditMode: accounts.creditMode,
				promoEndsAt: accounts.promoEndsAt,
				revertAprBps: accounts.revertAprBps,
			})
			.from(accounts)
			.where(and(withUserFilter(user.id, accounts), eq(accounts.type, "credit-card")));
		cards = await Promise.all(
			creditCards.map(async (card) => {
				const tx = await db
					.select({ type: accountTransactions.type, amount: accountTransactions.amount })
					.from(accountTransactions)
					.where(eq(accountTransactions.accountId, card.id))
					.orderBy(desc(accountTransactions.id));
				const outstanding = tx
					.filter((t) => t.type === "charge")
					.reduce((sum, t) => sum + Math.abs(t.amount), 0);
				return {
					slug: card.slug,
					name: card.name,
					outstandingPence: outstanding,
					promoEndsAt: card.promoEndsAt
						? card.promoEndsAt.toISOString().slice(0, 10)
						: null,
					revertAprBasisPoints: card.revertAprBps,
					creditMode: card.creditMode,
				};
			}),
		);
	}

	const netWorthHistory =
		tool.slug === "fi-projector" ? await getNetWorthHistory(user.id) : [];

	// Statement gap finder (v3.2 harvest): months with zero transactions
	// INSIDE each account's declared range — the statement model's own
	// blind spots, user-scoped (D0: before-first is not a gap).
	// Months bucket in JS: strftime on this timestamp column returns NULL
	// (sqlite reads bare unix-second ints as Julian days — documented in
	// budgets.ts); the SQL group-by silently collapsed every month to NULL
	// and rendered false "complete" verdicts (fixed 2026-11-01).
	const statementGaps: Array<{ slug: string; name: string; type: string; month: string }> = [];
	if (tool.slug === "statement-gaps") {
		const dateRows = await db
			.selectDistinct({
				slug: accounts.slug,
				name: accounts.name,
				type: accounts.type,
				transactionDate: accountTransactions.transactionDate,
			})
			.from(accountTransactions)
			.innerJoin(accounts, eq(accounts.id, accountTransactions.accountId))
			.where(withUserFilter(user.id, accounts));
		const seen = new Set<string>();
		for (const r of dateRows) {
			const d = new Date(r.transactionDate);
			if (Number.isNaN(d.getTime())) continue;
			const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
			const dedupe = `${r.slug}|${key}`;
			if (seen.has(dedupe)) continue;
			seen.add(dedupe);
			statementGaps.push({ slug: r.slug, name: r.name, type: r.type, month: key });
		}
		statementGaps.sort((a, b) => a.name.localeCompare(b.name) || a.month.localeCompare(b.month));
	}

	return { tool, toolsData: data, cards, netWorthHistory, statementGaps };
};
