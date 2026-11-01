import { and, eq, gte, inArray, lte, ne, notInArray, or, isNull, sql } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { getCategories } from "$lib/server/categories";
import { accounts, accountTransactions, budgetMonths } from "$lib/db/schema";
import type { BudgetConfig } from "$lib/types/budget";
import { parseBudgetRow } from "$lib/server/budgets";
import type { DailyTx, MonthlyFlow } from "$lib/utils/trends-math";
import { flowsByMonth } from "$lib/utils/trends-math";

/**
 * Trends aggregation (v3.2 A14 / V6) — server side. The spend definition
 * mirrors the budget engine (withdrawal + charge − refund, then config
 * exclusions), so the homepage headline always reconciles with the month
 * page. Balance-tab flows use the raw cash filter (statement model D0:
 * declared months only; projections come from declared-history averages,
 * see src/lib/utils/trends-math.ts).
 */

export interface MonthlySpendSeries {
	monthKey: string;
	/** raw per-day outflows (post-exclusion), pre-cumulative */
	daily: DailyTx[];
	/** spend for the whole month in pence (reconciles with the engine) */
	totalPence: number;
}

export interface TrendsSnapshot {
	currentMonthKey: string;
	previousMonthKey: string;
	current: MonthlySpendSeries;
	previous: MonthlySpendSeries;
	/** open accounts included in the trends view */
	accountCount: number;
	/** D0: does the current statement month have any declared data yet? */
	currentMonthDeclared: boolean;
	isCurrentCalendarMonth: boolean;
}

function monthKeyStr(year: number, month: number): string {
	return `${year}-${String(month).padStart(2, "0")}`;
}

function monthRange(monthKey: string): { start: Date; end: Date } {
	const [y, m] = monthKey.split("-").map(Number);
	return {
		start: new Date(Date.UTC(y, m - 1, 1)),
		end: new Date(Date.UTC(y, m, 0, 23, 59, 59)),
	};
}

/** Read the month's budget config WITHOUT creating one (trends is read-only;
 *  a missing config simply means no exclusions). */
async function readBudgetConfig(
	userId: number,
	monthKey: string,
): Promise<BudgetConfig | null> {
	const row = await db.query.budgetMonths.findFirst({
		where: and(withUserFilter(userId, budgetMonths), eq(budgetMonths.month, monthKey)),
	});
	return row ? parseBudgetRow(row) : null;
}

const SPEND_IN = sql<number>`CASE WHEN ${accountTransactions.type} IN ('withdrawal', 'charge') THEN ABS(${accountTransactions.amount}) ELSE 0 END`;
const REFUND_IN = sql<number>`CASE WHEN ${accountTransactions.type} = 'refund' THEN ABS(${accountTransactions.amount}) ELSE 0 END`;

async function monthlySpendSeries(
	userId: number,
	monthKey: string,
	config: BudgetConfig | null,
): Promise<MonthlySpendSeries> {
	const { start, end } = monthRange(monthKey);

	const conditions = [
		withUserFilter(userId, accounts),
		gte(accountTransactions.transactionDate, start),
		lte(accountTransactions.transactionDate, end),
		ne(accountTransactions.type, "interest_accrued"),
	];
	if (config?.excludedTypes.length) {
		conditions.push(notInArray(accountTransactions.type, config.excludedTypes));
	}
	if (config?.excludedAccountIds.length) {
		conditions.push(notInArray(accountTransactions.accountId, config.excludedAccountIds));
	}
	if (config?.excludedCategoryIds.length) {
		const excl = or(
			isNull(accountTransactions.categoryId),
			notInArray(accountTransactions.categoryId, config.excludedCategoryIds),
		);
		if (excl) conditions.push(excl);
	}

	const dayExpr = sql<number>`strftime('%d', ${accountTransactions.transactionDate}, 'unixepoch')`;

	const rows = await db
		.select({
			day: dayExpr,
			spend: sql<number>`sum(${SPEND_IN}) - sum(${REFUND_IN})`,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accounts.id, accountTransactions.accountId))
		.where(and(...conditions))
		.groupBy(dayExpr);

	const daily: DailyTx[] = rows
		.map((r) => ({
			day: Number(r.day),
			// spend rows are magnitudes already; a net-refund day carries −out
			amountPence: -Number(r.spend ?? 0),
		}))
		.filter((d) => d.amountPence !== 0);

	const totalPence = daily.reduce((s, d) => s + -d.amountPence, 0);
	return { monthKey, daily, totalPence };
}

export async function getTrendsSnapshot(
	userId: number,
	now = new Date(),
): Promise<TrendsSnapshot> {
	const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
	const [y, m] = currentMonthKey.split("-").map(Number);
	const previousMonthKey = monthKeyStr(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);

	const currentConfig = await readBudgetConfig(userId, currentMonthKey);
	const previousConfig = await readBudgetConfig(userId, previousMonthKey);

	const [current, previous, accountRows] = await Promise.all([
		monthlySpendSeries(userId, currentMonthKey, currentConfig),
		monthlySpendSeries(userId, previousMonthKey, previousConfig),
		db
			.select({ id: accounts.id })
			.from(accounts)
			.where(and(withUserFilter(userId, accounts), isNull(accounts.deletedAt))),
	]);

	return {
		currentMonthKey,
		previousMonthKey,
		current,
		previous,
		accountCount: accountRows.length,
		currentMonthDeclared: current.daily.length > 0,
		isCurrentCalendarMonth: true,
	};
}

export interface BalanceFlowPoint extends MonthlyFlow {
	/** aggregated closing balance at month end (pence) across accounts */
	closingBalancePence: number;
}

/**
 * Balance-tab series: per-month in/out across ALL accounts plus the
 * aggregated closing balance (per-account running sums, then summed).
 * Declared months only — a month appears only if some account transacted.
 */
export async function getBalanceFlows(userId: number): Promise<BalanceFlowPoint[]> {
	const monthExpr = sql<string>`strftime('%Y-%m', ${accountTransactions.transactionDate}, 'unixepoch')`;

	const rows = await db
		.select({
			accountId: accountTransactions.accountId,
			monthKey: monthExpr,
			net: sql<number>`sum(${accountTransactions.amount})`,
			closing: sql<number>`sum(sum(${accountTransactions.amount})) over (partition by ${accountTransactions.accountId} order by ${monthExpr})`,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accounts.id, accountTransactions.accountId))
		.where(and(withUserFilter(userId, accounts), ne(accountTransactions.type, "interest_accrued")))
		.groupBy(accountTransactions.accountId, monthExpr)
		.orderBy(monthExpr);

	const byMonth = new Map<string, { in: number; out: number; closing: number }>();
	for (const row of rows) {
		const net = Number(row.net ?? 0);
		const entry =
			byMonth.get(row.monthKey) ?? { in: 0, out: 0, closing: 0 };
		if (net >= 0) entry.in += net;
		else entry.out += -net;
		entry.closing += Number(row.closing ?? 0);
		byMonth.set(row.monthKey, entry);
	}

	return flowsByMonth(
		[...byMonth.entries()].flatMap(([monthKey, e]) => [
			{ monthKey, amountPence: e.in },
			{ monthKey, amountPence: -e.out },
		]),
	).map((flow) => ({
		...flow,
		closingBalancePence: byMonth.get(flow.monthKey)?.closing ?? 0,
	}));
}

/** Category breakdown for a month: spent per category + the excluded set
 *  (named), so the SPENDING and TARGET tabs can show both blocks. */
export async function getCategorySpend(
	userId: number,
	monthKey: string,
): Promise<{
	included: Array<{ name: string; spentPence: number }>;
	excluded: Array<{ name: string; spentPence: number }>;
}> {
	const config = await readBudgetConfig(userId, monthKey);
	const { start, end } = monthRange(monthKey);

	const conditions = [
		withUserFilter(userId, accounts),
		gte(accountTransactions.transactionDate, start),
		lte(accountTransactions.transactionDate, end),
		ne(accountTransactions.type, "interest_accrued"),
		inArray(accountTransactions.type, ["withdrawal", "charge"] as const),
	];
	if (config?.excludedAccountIds.length) {
		conditions.push(notInArray(accountTransactions.accountId, config.excludedAccountIds));
	}

	const rows = await db
		.select({
			categoryId: accountTransactions.categoryId,
			spent: sql<number>`sum(ABS(${accountTransactions.amount}))`,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accounts.id, accountTransactions.accountId))
		.where(and(...conditions))
		.groupBy(accountTransactions.categoryId);

	// category names via the categories util
	const cats = await getCategories(userId);
	const nameFor = new Map(cats.map((c) => [c.id, c.name] as const));

	const included: Array<{ name: string; spentPence: number }> = [];
	const excluded: Array<{ name: string; spentPence: number }> = [];
	for (const row of rows) {
		const name = row.categoryId === null ? "Uncategorised" : (nameFor.get(row.categoryId) ?? "Unknown");
		const spent = Number(row.spent ?? 0);
		const isExcluded =
			row.categoryId === null
				? false
				: (config?.excludedCategoryIds ?? []).includes(row.categoryId);
		(isExcluded ? excluded : included).push({ name, spentPence: spent });
	}
	included.sort((a, b) => b.spentPence - a.spentPence);
	excluded.sort((a, b) => b.spentPence - a.spentPence);
	return { included, excluded };
}
