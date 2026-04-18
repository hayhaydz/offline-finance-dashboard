import { eq, inArray, sql } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accountTransactions } from "$lib/db/schema";
import { devLog } from "$lib/server/logger";

export interface MonthlyBalancePoint {
	monthKey: string; // YYYY-MM
	monthStart: Date;
	monthlyNetChange: number;
	closingBalance: number;
}

export async function getCurrentBalanceForAccount(
	accountId: number,
): Promise<number> {
	devLog("getCurrentBalanceForAccount", "Fetching balance", { accountId });
	const balances = await getCurrentBalancesForAccounts([accountId]);
	return balances.get(accountId) ?? 0;
}

export async function getCurrentBalancesForAccounts(
	accountIds: number[],
): Promise<Map<number, number>> {
	devLog("getCurrentBalancesForAccounts", "Fetching balances", { count: accountIds.length });
	if (accountIds.length === 0) return new Map();

	const rows = await db
		.select({
			accountId: accountTransactions.accountId,
			total: sql<number>`coalesce(sum(${accountTransactions.amount}), 0)`,
		})
		.from(accountTransactions)
		.where(inArray(accountTransactions.accountId, accountIds))
		.groupBy(accountTransactions.accountId);

	const result = new Map<number, number>();
	for (const id of accountIds) result.set(id, 0);
	for (const row of rows) {
		result.set(row.accountId, Number(row.total ?? 0));
	}
	return result;
}

export async function getLatestTransactionDateForAccounts(
	accountIds: number[],
): Promise<Map<number, Date | null>> {
	devLog("getLatestTransactionDateForAccounts", "Fetching latest tx dates", { count: accountIds.length });
	if (accountIds.length === 0) return new Map();

	const rows = await db
		.select({
			accountId: accountTransactions.accountId,
			latest: sql<Date | null>`max(${accountTransactions.transactionDate})`,
		})
		.from(accountTransactions)
		.where(inArray(accountTransactions.accountId, accountIds))
		.groupBy(accountTransactions.accountId);

	const result = new Map<number, Date | null>();
	for (const id of accountIds) result.set(id, null);

	for (const row of rows) {
		const latestRaw = row.latest as unknown;
		let latest: Date | null = null;

		if (latestRaw instanceof Date) {
			latest = latestRaw;
		} else if (typeof latestRaw === "number") {
			// SQLite stores timestamps as Unix seconds; JS Date expects milliseconds
			latest = new Date(latestRaw * 1000);
		} else if (typeof latestRaw === "string") {
			const parsed = new Date(latestRaw);
			if (!Number.isNaN(parsed.getTime())) {
				latest = parsed;
			}
		}

		result.set(row.accountId, latest);
	}

	return result;
}

export async function getMonthlyBalanceHistory(
	accountId: number,
	limitMonths = 24,
): Promise<MonthlyBalancePoint[]> {
	devLog("getMonthlyBalanceHistory", "Fetching monthly history", { accountId, limitMonths });
	const monthExpr = sql<string>`strftime('%Y-%m', ${accountTransactions.transactionDate}, 'unixepoch')`;

	const rows = await db
		.select({
			monthKey: monthExpr,
			monthlyNetChange: sql<number>`sum(${accountTransactions.amount})`,
			closingBalance:
				sql<number>`sum(sum(${accountTransactions.amount})) over (order by ${monthExpr})`,
		})
		.from(accountTransactions)
		.where(eq(accountTransactions.accountId, accountId))
		.groupBy(monthExpr)
		.orderBy(monthExpr);

	if (rows.length === 0) return [];

	return rows.slice(-limitMonths).map((row) => {
		const [year, month] = row.monthKey.split("-").map(Number);
		return {
			monthKey: row.monthKey,
			monthStart: new Date(Date.UTC(year, month - 1, 1)),
			monthlyNetChange: Number(row.monthlyNetChange ?? 0),
			closingBalance: Number(row.closingBalance ?? 0),
		};
	});
}
