/**
 * Interest Breakdown — Database Queries
 *
 * DB query for interest transactions with running totals.
 * Separated from aggregation/reconciliation for testability.
 */

import { and, asc, eq, inArray, lte, gte } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, accountTransactions } from "$lib/db/schema";
import { devLog } from "$lib/server/logger";

import type { InterestTransaction } from "$lib/types/breakdown";

/**
 * Fetch all interest transactions for the user in the tax year with account details.
 * Results are ordered by date ascending for running total calculation.
 *
 * @param userId - User ID from session
 * @param taxYearStart - Start of tax year (6 April)
 * @param taxYearEnd - End of tax year (5 April)
 * @returns Array of interest transactions with account details
 */
export async function getInterestTransactions(
	userId: number,
	taxYearStart: Date,
	taxYearEnd: Date,
): Promise<InterestTransaction[]> {
	devLog("getInterestTransactions", "Fetching interest transactions", {
		userId,
		taxYearStart,
		taxYearEnd,
	});

	// Get all user accounts first to create opening balance rows
	const userAccounts = await db.query.accounts.findMany({
		where: withUserFilter(userId, accounts),
	});

	const transactions = await db
		.select({
			id: accountTransactions.id,
			slug: accountTransactions.slug,
			transactionDate: accountTransactions.transactionDate,
			type: accountTransactions.type,
			amount: accountTransactions.amount,
			description: accountTransactions.description,
			accountId: accountTransactions.accountId,
			accountSlug: accounts.slug,
			accountName: accounts.name,
			accountType: accounts.type,
			accountInstitution: accounts.institution,
			accountTaxWrapper: accounts.taxWrapper,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(
			and(
				eq(accounts.userId, userId),
				inArray(accountTransactions.type, ["interest", "interest_accrued"]),
				gte(accountTransactions.transactionDate, taxYearStart),
				lte(accountTransactions.transactionDate, taxYearEnd),
			),
		)
		.orderBy(
			asc(accountTransactions.transactionDate),
			asc(accountTransactions.id),
		);

	// Initialize result with opening balance rows for each account that is a savings/investment account
	const result: InterestTransaction[] = [];

	for (const account of userAccounts) {
		if (account.type === "savings" || account.type === "investment") {
			result.push({
				id: -account.id, // Synthetic ID
				slug: `opening-${account.slug}`,
				transactionDate: taxYearStart,
				type: "opening",
				amount: 0,
				description: "Opening Balance @ 06 APR",
				runningTotal: 0,
				accountId: account.id,
				accountSlug: account.slug,
				accountName: account.name,
				accountType: account.type,
				accountInstitution: account.institution,
				accountTaxWrapper: account.taxWrapper,
			});
		}
	}

	// Calculate running total
	let runningTotal = 0;
	for (const tx of transactions) {
		runningTotal += tx.amount;
		result.push({
			id: tx.id,
			slug: tx.slug,
			transactionDate: tx.transactionDate,
			type: tx.type,
			amount: tx.amount,
			description: tx.description,
			runningTotal,
			accountId: tx.accountId,
			accountSlug: tx.accountSlug,
			accountName: tx.accountName,
			accountType: tx.accountType,
			accountInstitution: tx.accountInstitution,
			accountTaxWrapper: tx.accountTaxWrapper,
		});
	}

	// Final sort to ensure opening balances stay at the top for each date
	result.sort(
		(a, b) =>
			a.transactionDate.getTime() - b.transactionDate.getTime() || a.id - b.id,
	);

	devLog("getInterestTransactions", "Fetched transactions", {
		count: result.length,
		total: runningTotal,
	});

	return result;
}
