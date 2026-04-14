import { and, count, desc, eq, gte, lte, notInArray, or, isNull, sql } from "drizzle-orm";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	budgetMonths,
	spendingCategories,
} from "$lib/db/schema";
import { devLog } from "$lib/utils/logger";
import type { BudgetConfig, CategoryBreakdown, BudgetStatus } from "$lib/types/budget";

export type { BudgetConfig, CategoryBreakdown, BudgetStatus };

/** Sentinel ID for the virtual "Uncategorised" catch-all category */
export const UNCATEGORISED_ID = -1;

function parseBudgetConfig(row: typeof budgetMonths.$inferSelect): BudgetConfig {
	return {
		totalTargetInCents: row.totalTargetInCents,
		excludedCategoryIds: JSON.parse(row.excludedCategoryIds) as number[],
		excludedAccountIds: JSON.parse(row.excludedAccountIds) as number[],
		categoryTargets: JSON.parse(row.categoryTargets) as Record<number, number>,
	};
}

function getMonthRange(year: number, month: number) {
	const start = new Date(year, month - 1, 1);
	const end = new Date(year, month, 0, 23, 59, 59, 999);
	return { start, end };
}

function getDaysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

function getDaysElapsed(year: number, month: number): number {
	const now = new Date();
	const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
	if (!isCurrentMonth) {
		return getDaysInMonth(year, month);
	}
	return now.getDate();
}

export async function getBudgetStatus(
	userId: number,
	year: number,
	month: number,
): Promise<BudgetStatus> {
	const monthStr = `${year}-${String(month).padStart(2, "0")}`;

	const budgetRow = await ensureCurrentMonth(userId, monthStr);
	const budget = budgetRow ? parseBudgetConfig(budgetRow) : null;

	const { start, end } = getMonthRange(year, month);
	const totalDays = getDaysInMonth(year, month);
	const daysElapsed = getDaysElapsed(year, month);

	const conditions = [
		eq(accounts.userId, userId),
		gte(accountTransactions.transactionDate, start),
		lte(accountTransactions.transactionDate, end),
		sql`${accountTransactions.type} IN ('withdrawal', 'charge')`,
	];

	if (budget) {
		if (budget.excludedAccountIds.length > 0) {
			conditions.push(
				notInArray(accountTransactions.accountId, budget.excludedAccountIds),
			);
		}
		if (budget.excludedCategoryIds.length > 0) {
			conditions.push(
				or(
					isNull(accountTransactions.categoryId),
					notInArray(accountTransactions.categoryId, budget.excludedCategoryIds),
				)!,
			);
		}
	}

	const result = await db
		.select({ total: sql<number>`COALESCE(SUM(${accountTransactions.amount}), 0)` })
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(and(...conditions));

	const totalSpent = Math.abs(Number(result[0]?.total ?? 0));
	const avgPerDay = totalSpent / Math.max(daysElapsed, 1);
	const projectedTotal = avgPerDay * totalDays;

	devLog("getBudgetStatus", "Budget status computed", {
		month: monthStr,
		totalSpent,
		daysElapsed,
		totalDays,
		hasBudget: !!budget,
	});

	return {
		budget,
		totalSpent,
		daysElapsed,
		totalDays,
		avgPerDay,
		projectedTotal,
	};
}

export async function getCategoryBreakdown(
	userId: number,
	year: number,
	month: number,
	budget: BudgetConfig | null,
): Promise<CategoryBreakdown[]> {
	const { start, end } = getMonthRange(year, month);

	const allCategories = await db.query.spendingCategories.findMany({
		where: and(
			eq(spendingCategories.userId, userId),
			isNull(spendingCategories.deletedAt),
		),
		orderBy: (categories, { asc }) => [asc(categories.name)],
	});

	const conditions = [
		eq(accounts.userId, userId),
		gte(accountTransactions.transactionDate, start),
		lte(accountTransactions.transactionDate, end),
		sql`${accountTransactions.type} IN ('withdrawal', 'charge')`,
	];

	if (budget && budget.excludedAccountIds.length > 0) {
		conditions.push(
			notInArray(accountTransactions.accountId, budget.excludedAccountIds),
		);
	}

	const spendRows = await db
		.select({
			categoryId: accountTransactions.categoryId,
			total: sql<number>`COALESCE(SUM(ABS(${accountTransactions.amount})), 0)`,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(and(...conditions))
		.groupBy(accountTransactions.categoryId);

	const spendMap = new Map<number, number>();
	let uncategorisedSpent = 0;
	for (const row of spendRows) {
		if (row.categoryId !== null) {
			spendMap.set(row.categoryId, Number(row.total));
		} else {
			uncategorisedSpent = Number(row.total);
		}
	}

	const breakdown: CategoryBreakdown[] = allCategories.map((cat) => ({
		id: cat.id,
		name: cat.name,
		colour: cat.colour,
		spent: spendMap.get(cat.id) ?? 0,
		target: budget?.categoryTargets[String(cat.id)] ?? null,
	}));

	breakdown.sort((a, b) => {
		const aTargeted = a.target !== null ? 1 : 0;
		const bTargeted = b.target !== null ? 1 : 0;
		if (aTargeted !== bTargeted) return bTargeted - aTargeted;

		if (a.target !== null && b.target !== null) {
			const aPct = a.target > 0 ? a.spent / a.target : 0;
			const bPct = b.target > 0 ? b.spent / b.target : 0;
			return bPct - aPct;
		}

		return b.spent - a.spent;
	});

	breakdown.push({
		id: UNCATEGORISED_ID,
		name: "Uncategorised",
		colour: "#9CA3AF", // gray-400
		spent: uncategorisedSpent,
		target: budget?.categoryTargets[String(UNCATEGORISED_ID)] ?? null,
	});

	// Re-sort: push uncategorised to the end of its target group
	breakdown.sort((a, b) => {
		const aTargeted = a.target !== null ? 1 : 0;
		const bTargeted = b.target !== null ? 1 : 0;
		if (aTargeted !== bTargeted) return bTargeted - aTargeted;

		if (a.id === UNCATEGORISED_ID) return 1;
		if (b.id === UNCATEGORISED_ID) return 1;

		if (a.target !== null && b.target !== null) {
			const aPct = a.target > 0 ? a.spent / a.target : 0;
			const bPct = b.target > 0 ? b.spent / b.target : 0;
			return bPct - aPct;
		}

		return b.spent - a.spent;
	});

	return breakdown;
}

export async function getBudgetHistory(
	userId: number,
	page: number,
	pageSize: number = 12,
) {
	const offset = page * pageSize;

	const [{ total }] = await db
		.select({ total: count() })
		.from(budgetMonths)
		.where(eq(budgetMonths.userId, userId));

	const totalPages = Math.ceil(total / pageSize);

	const months = await db.query.budgetMonths.findMany({
		where: eq(budgetMonths.userId, userId),
		orderBy: desc(budgetMonths.month),
		limit: pageSize,
		offset,
	});

	const history = await Promise.all(
		months.map(async (row) => {
			const [yearStr, monthStr] = row.month.split("-");
			const year = Number(yearStr);
			const month = Number(monthStr);
			const { start, end } = getMonthRange(year, month);
			const config = parseBudgetConfig(row);

			const conditions = [
				eq(accounts.userId, userId),
				gte(accountTransactions.transactionDate, start),
				lte(accountTransactions.transactionDate, end),
				sql`${accountTransactions.type} IN ('withdrawal', 'charge')`,
			];

			if (config.excludedAccountIds.length > 0) {
				conditions.push(
					notInArray(accountTransactions.accountId, config.excludedAccountIds),
				);
			}
			if (config.excludedCategoryIds.length > 0) {
				conditions.push(
					or(
						isNull(accountTransactions.categoryId),
						notInArray(accountTransactions.categoryId, config.excludedCategoryIds),
					)!,
				);
			}

			const result = await db
				.select({ total: sql<number>`COALESCE(SUM(ABS(${accountTransactions.amount})), 0)` })
				.from(accountTransactions)
				.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
				.where(and(...conditions));

			return {
				month: row.month,
				totalTarget: row.totalTargetInCents,
				actualSpent: Number(result[0]?.total ?? 0),
			};
		}),
	);

	return { months: history, pagination: { page, totalPages } };
}

async function ensureCurrentMonth(
	userId: number,
	monthStr: string,
): Promise<typeof budgetMonths.$inferSelect | null> {
	const existing = await db.query.budgetMonths.findFirst({
		where: and(
			eq(budgetMonths.userId, userId),
			eq(budgetMonths.month, monthStr),
		),
	});

	if (existing) return existing;

	const previous = await db.query.budgetMonths.findFirst({
		where: and(
			eq(budgetMonths.userId, userId),
			sql`${budgetMonths.month} < ${monthStr}`,
		),
		orderBy: desc(budgetMonths.month),
	});

	if (!previous) return null;

	const [newRow] = await db
		.insert(budgetMonths)
		.values({
			userId,
			month: monthStr,
			totalTargetInCents: previous.totalTargetInCents,
			excludedCategoryIds: previous.excludedCategoryIds,
			excludedAccountIds: previous.excludedAccountIds,
			categoryTargets: previous.categoryTargets,
		})
		.returning();

	devLog("ensureCurrentMonth", "Rolled budget to new month", {
		from: previous.month,
		to: monthStr,
	});

	return newRow;
}

export async function saveBudgetRow(
	userId: number,
	monthStr: string,
	updates: Partial<Pick<typeof budgetMonths.$inferInsert, "totalTargetInCents" | "excludedCategoryIds" | "excludedAccountIds" | "categoryTargets">>,
): Promise<void> {
	const existing = await db.query.budgetMonths.findFirst({
		where: and(
			eq(budgetMonths.userId, userId),
			eq(budgetMonths.month, monthStr),
		),
	});

	if (existing) {
		await db
			.update(budgetMonths)
			.set(updates)
			.where(eq(budgetMonths.id, existing.id));
	} else {
		await db.insert(budgetMonths).values({
			userId,
			month: monthStr,
			totalTargetInCents: updates.totalTargetInCents ?? 0,
			excludedCategoryIds: updates.excludedCategoryIds ?? "[]",
			excludedAccountIds: updates.excludedAccountIds ?? "[]",
			categoryTargets: updates.categoryTargets ?? "{}",
		});
	}
}

export async function getBudgetRow(userId: number, monthStr: string) {
	return ensureCurrentMonth(userId, monthStr);
}
