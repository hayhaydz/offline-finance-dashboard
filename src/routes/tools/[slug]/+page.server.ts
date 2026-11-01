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
	const statementGaps =
		tool.slug === "statement-gaps"
			? await db
					.select({
						slug: accounts.slug,
						name: accounts.name,
						type: accounts.type,
						month: sql<string>`strftime('%Y-%m', ${accountTransactions.transactionDate})`,
					})
					.from(accountTransactions)
					.innerJoin(accounts, eq(accounts.id, accountTransactions.accountId))
					.where(withUserFilter(user.id, accounts))
					.groupBy(accounts.slug, accounts.name, accounts.type, sql`strftime('%Y-%m', ${accountTransactions.transactionDate})`)
					.orderBy(accounts.name, sql`strftime('%Y-%m', ${accountTransactions.transactionDate})`)
			: [];

	return { tool, toolsData: data, cards, netWorthHistory, statementGaps };
};
