/**
 * ISA Breakdown — Database Queries
 *
 * Fetches ISA accounts and their subscription transactions from the database.
 */

import { and, asc, eq, inArray, lte, gte } from "drizzle-orm";
import { TAX_FREE_WRAPPERS } from "$lib/utils/domain-constants";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, accountTransactions } from "$lib/db/schema";
import { getUkTaxYearBounds } from "$lib/utils/tax-year-utils";
import { devLog } from "$lib/server/logger";

import type { ISATransaction } from "$lib/types/breakdown";

/**
 * Fetch all ISA subscription transactions for a tax year.
 * Includes account details for display and filtering.
 *
 * NOTE: Only "deposit" transactions count toward ISA subscription allowance.
 * "transfer_in" between ISAs are included for display but don't use additional allowance.
 */
export async function getISATransactions(params: {
	userId: number;
	taxYearStart: Date;
	taxYearEnd: Date;
}): Promise<ISATransaction[]> {
	const { userId, taxYearStart, taxYearEnd } = params;

	devLog("isaBreakdown", "Fetching ISA transactions", {
		userId,
		taxYearStart: taxYearStart.toISOString(),
		taxYearEnd: taxYearEnd.toISOString(),
	});

	const isaAccounts = await db.query.accounts.findMany({
		where: and(
			withUserFilter(userId, accounts),
			inArray(accounts.taxWrapper, TAX_FREE_WRAPPERS),
		),
		columns: {
			id: true,
			slug: true,
			name: true,
			type: true,
			institution: true,
			taxWrapper: true,
		},
	});

	if (isaAccounts.length === 0) {
		devLog("isaBreakdown", "No ISA accounts found for user", { userId });
		return [];
	}

	const accountIds = isaAccounts.map((a) => a.id);
	const accountMap = new Map(isaAccounts.map((a) => [a.id, a]));

	const transactions = await db.query.accountTransactions.findMany({
		where: and(
			inArray(accountTransactions.accountId, accountIds),
			inArray(accountTransactions.type, ["deposit", "transfer_in"]),
			gte(accountTransactions.transactionDate, taxYearStart),
			lte(accountTransactions.transactionDate, taxYearEnd),
		),
		orderBy: [
			asc(accountTransactions.transactionDate),
			asc(accountTransactions.id),
		],
		columns: {
			id: true,
			slug: true,
			type: true,
			amount: true,
			description: true,
			transactionDate: true,
			accountId: true,
		},
	});

	devLog("isaBreakdown", "Fetched ISA transactions", {
		userId,
		transactionCount: transactions.length,
	});

	const allowanceTransactions: ISATransaction[] = [];
	let runningTotal = 0;

	for (const tx of transactions) {
		const account = accountMap.get(tx.accountId);
		if (!account) continue;

		if (tx.type === "deposit") {
			runningTotal += Math.max(0, tx.amount);
		}

		allowanceTransactions.push({
			id: tx.id,
			slug: tx.slug,
			transactionDate: tx.transactionDate,
			type: tx.type,
			amount: tx.amount,
			description: tx.description,
			runningTotal,
			accountId: account.id,
			accountSlug: account.slug,
			accountName: account.name,
			accountType: account.type,
			accountInstitution: account.institution,
			accountTaxWrapper: account.taxWrapper,
		});
	}

	return allowanceTransactions;
}

/**
 * Get available tax years for ISA breakdown navigation.
 * Based on existing ISA deposit transactions.
 */
export async function getISAAvailableTaxYears(
	userId: number,
): Promise<Array<{ slug: string; start: Date; end: Date }>> {
	const isaAccounts = await db.query.accounts.findMany({
		where: and(
			withUserFilter(userId, accounts),
			inArray(accounts.taxWrapper, TAX_FREE_WRAPPERS),
		),
		columns: { id: true },
	});

	if (isaAccounts.length === 0) {
		return [];
	}

	const accountIds = isaAccounts.map((a) => a.id);

	const transactions = await db.query.accountTransactions.findMany({
		where: and(
			inArray(accountTransactions.accountId, accountIds),
			eq(accountTransactions.type, "deposit"),
		),
		columns: { transactionDate: true },
	});

	const availableTaxYears = new Map<
		string,
		{ slug: string; start: Date; end: Date }
	>();

	for (const tx of transactions) {
		const bounds = getUkTaxYearBounds(tx.transactionDate);
		const startYear = bounds.start.getUTCFullYear();
		const endYear = bounds.end.getUTCFullYear();
		const slug = `${startYear}-${String(endYear).slice(-2)}`;

		if (!availableTaxYears.has(slug)) {
			availableTaxYears.set(slug, {
				slug,
				start: bounds.start,
				end: bounds.end,
			});
		}
	}

	return Array.from(availableTaxYears.values()).sort(
		(a, b) => b.start.getTime() - a.start.getTime(),
	);
}
