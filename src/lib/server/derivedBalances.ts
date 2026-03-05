import { eq, inArray } from "drizzle-orm";
import { db } from "$lib/db/client";
import { accountTransactions } from "$lib/db/schema";

export interface MonthlyBalancePoint {
	monthKey: string; // YYYY-MM
	monthStart: Date;
	monthlyNetChange: number;
	closingBalance: number;
}

export async function getCurrentBalanceForAccount(accountId: number): Promise<number> {
	const balances = await getCurrentBalancesForAccounts([accountId]);
	return balances.get(accountId) ?? 0;
}

export async function getCurrentBalancesForAccounts(
	accountIds: number[],
): Promise<Map<number, number>> {
	if (accountIds.length === 0) return new Map();

	const rows = await db
		.select({
			accountId: accountTransactions.accountId,
			amount: accountTransactions.amount,
		})
		.from(accountTransactions)
		.where(inArray(accountTransactions.accountId, accountIds));

	const result = new Map<number, number>();
	for (const id of accountIds) result.set(id, 0);
	for (const row of rows) {
		result.set(row.accountId, (result.get(row.accountId) ?? 0) + row.amount);
	}
	return result;
}

export async function getLatestTransactionDateForAccounts(
	accountIds: number[],
): Promise<Map<number, Date | null>> {
	if (accountIds.length === 0) return new Map();

	const rows = await db
		.select({
			accountId: accountTransactions.accountId,
			transactionDate: accountTransactions.transactionDate,
		})
		.from(accountTransactions)
		.where(inArray(accountTransactions.accountId, accountIds));

	const result = new Map<number, Date | null>();
	for (const id of accountIds) result.set(id, null);

	for (const row of rows) {
		const current = result.get(row.accountId);
		if (!current || row.transactionDate > current) {
			result.set(row.accountId, row.transactionDate);
		}
	}

	return result;
}

export async function getMonthlyBalanceHistory(
	accountId: number,
	limitMonths = 24,
): Promise<MonthlyBalancePoint[]> {
	const transactions = await db.query.accountTransactions.findMany({
		where: eq(accountTransactions.accountId, accountId),
		orderBy: (tx, { asc }) => asc(tx.transactionDate),
		columns: {
			amount: true,
			transactionDate: true,
		},
	});

	if (transactions.length === 0) return [];

	const monthlyNet = new Map<string, number>();
	const monthlyClosing = new Map<string, number>();
	let runningBalance = 0;

	for (const tx of transactions) {
		runningBalance += tx.amount;
		const year = tx.transactionDate.getUTCFullYear();
		const month = String(tx.transactionDate.getUTCMonth() + 1).padStart(2, "0");
		const monthKey = `${year}-${month}`;
		monthlyNet.set(monthKey, (monthlyNet.get(monthKey) ?? 0) + tx.amount);
		monthlyClosing.set(monthKey, runningBalance);
	}

	const monthKeys = Array.from(monthlyNet.keys()).sort();
	const points = monthKeys.map((monthKey) => {
		const [year, month] = monthKey.split("-").map((v) => parseInt(v, 10));
		return {
			monthKey,
			monthStart: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
			monthlyNetChange: monthlyNet.get(monthKey) ?? 0,
			closingBalance: monthlyClosing.get(monthKey) ?? 0,
		};
	});

	return points.slice(-limitMonths);
}
