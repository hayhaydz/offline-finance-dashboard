/**
 * Refund Reclassification Utility
 *
 * Lists historical `value_change` rows on credit-card accounts with negative
 * amounts — the pre-`refund`-type encoding of card refunds — and offers a
 * confirmed one-click reclassification to `refund`.
 *
 * Nothing changes silently: the caller must invoke `reclassifyValueChangeRefunds`
 * from an explicit user-confirmed action. Amounts are preserved; only the type
 * changes. Glossary: docs/transactions/type-glossary.md
 */

import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, accountTransactions } from "$lib/db/schema";
import { devLog, logInfo } from "$lib/server/logger";

export interface RefundCandidate {
	id: number;
	slug: string;
	accountId: number;
	accountSlug: string;
	accountName: string;
	transactionDate: Date;
	amount: number;
	description: string | null;
}

/**
 * Candidate rows: `value_change` type, negative amount, on the user's
 * credit-card accounts. Ordered oldest-first for review.
 */
export async function listRefundCandidates(
	userId: number,
): Promise<RefundCandidate[]> {
	const rows = await db
		.select({
			id: accountTransactions.id,
			slug: accountTransactions.slug,
			accountId: accountTransactions.accountId,
			accountSlug: accounts.slug,
			accountName: accounts.name,
			transactionDate: accountTransactions.transactionDate,
			amount: accountTransactions.amount,
			description: accountTransactions.description,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(
			and(
				withUserFilter(userId, accounts),
				eq(accounts.type, "credit-card"),
				eq(accountTransactions.type, "value_change"),
				lt(accountTransactions.amount, 0),
			),
		)
		.orderBy(asc(accountTransactions.transactionDate));

	return rows;
}

/**
 * Reclassify all candidate rows from `value_change` to `refund`.
 * Amounts and all other columns are preserved. Returns the number of
 * rows reclassified (0 when no candidates exist).
 */
export async function reclassifyValueChangeRefunds(
	userId: number,
): Promise<number> {
	const candidates = await listRefundCandidates(userId);

	if (candidates.length === 0) {
		return 0;
	}

	const candidateIds = candidates.map((c) => c.id);

	const result = await db
		.update(accountTransactions)
		.set({ type: "refund" })
		.where(
			and(
				inArray(accountTransactions.id, candidateIds),
				eq(accountTransactions.type, "value_change"),
				lt(accountTransactions.amount, 0),
			),
		)
		.returning({ id: accountTransactions.id });

	logInfo(
		"reclassifyValueChangeRefunds",
		"Reclassified value_change rows to refund",
		{
			userId,
			requested: candidates.length,
			reclassified: result.length,
		},
	);
	devLog("reclassifyValueChangeRefunds", "Row-count report", {
		userId,
		reclassified: result.length,
	});

	return result.length;
}
