import type { PageServerLoad } from "./$types";
import { and, desc, eq, isNull } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accountTransactions, accounts } from "$lib/db/schema";
import { detectRecurringPatterns } from "$lib/server/recurring-patterns";
import { requireAuth } from "$lib/server/utils/auth-guard";
import { projectObligations } from "$lib/utils/surface-views";

/**
 * Bills (v3 B14, R25) — the recurring-money-out surface.
 *
 * DESIGN DECISION (recorded): bills are DERIVED from payment evidence
 * (the recurring-pattern detector over real transactions), not a
 * hand-maintained bills table. The direct-debit vs billed-as-invoiced
 * distinction is invisible in the data and irrelevant to the question
 * this page answers: what regular money goes out, how much, and when is
 * the next one. Evidence-based means zero data entry and zero drift.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	const txs = await db
		.select({
			description: accountTransactions.description,
			amount: accountTransactions.amount,
			transactionDate: accountTransactions.transactionDate,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(
			and(
				withUserFilter(user.id, accounts),
				isNull(accounts.deletedAt),
				eq(accountTransactions.type, "withdrawal"),
			),
		)
		.orderBy(desc(accountTransactions.transactionDate));

	const patterns = detectRecurringPatterns(txs);

	const now = new Date();
	const next60 = projectObligations(patterns, now, 60);
	const monthlyTotalPence = patterns.reduce(
		(sum, p) => sum + Math.abs(p.approximateAmount),
		0,
	);

	return {
		patterns: patterns.map((p) => ({
			description: p.description,
			amountPence: Math.abs(Math.round(p.approximateAmount)),
			lastDate: p.lastDate.toISOString().slice(0, 10),
			nextDate:
				next60.find((o) => o.description === p.description)?.date ?? null,
		})),
		monthlyTotalPence,
		yearlyTotalPence: monthlyTotalPence * 12,
	};
};
