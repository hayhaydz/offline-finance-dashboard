import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	notInArray,
	or,
	sql,
} from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	budgetConfigAmendments,
	budgetMonths,
	spendingCategories,
} from "$lib/db/schema";
import { devLog } from "$lib/server/logger";
import { decryptTxDescription } from "$lib/server/crypto/protected-fields";
import type {
	AmendmentTimelineEntry,
	BudgetConfig,
	BudgetStatus,
	CategoryBreakdown,
} from "$lib/types/budget";
import {
	BUDGET_SPENDING_TYPES,
	TRANSACTION_TYPES,
	type TransactionType,
} from "$lib/utils/domain-constants";

export type { BudgetConfig, CategoryBreakdown, BudgetStatus };

/** Sentinel ID for the virtual "Uncategorised" catch-all category */
export const UNCATEGORISED_ID = -1;

/**
 * Budget spending filter + netting.
 *
 * Spending = |withdrawal| + |charge| − |refund| — see
 * docs/transactions/type-glossary.md. Transfers between owned accounts and
 * liability repayments (payment) are excluded. Every budget query below uses
 * these helpers so the definition cannot diverge per call site.
 *
 * `budgetTypeFilter` layers per-budget type exclusions on top of the
 * taxonomy spending rules; excluding every spending type yields no rows.
 */
function budgetTypeFilter(excludedTypes: TransactionType[]) {
	const included = BUDGET_SPENDING_TYPES.filter(
		(t) => !excludedTypes.includes(t),
	);
	return included.length === 0
		? sql`false`
		: inArray(accountTransactions.type, [...included]);
}

/** Net spending aggregate: spends count positive, refunds subtract. */
function spendingSumSql() {
	return sql<number>`COALESCE(SUM(CASE WHEN ${accountTransactions.type} IN ('withdrawal', 'charge') THEN ABS(${accountTransactions.amount}) ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN ${accountTransactions.type} = 'refund' THEN ABS(${accountTransactions.amount}) ELSE 0 END), 0)`;
}

/** Parse budget JSON columns — Drizzle's mapFromDriverValue is not invoked by
 *  better-sqlite3-multiple-ciphers, so these arrive as raw strings. */
function parseJsonCol<T>(value: T | string): T {
	return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

/** JSON column values are untyped at the DB level — validate on read/write. */
function sanitizeExcludedTypes(value: string[]): TransactionType[] {
	return value.filter((t): t is TransactionType =>
		TRANSACTION_TYPES.includes(t as TransactionType),
	);
}

/** A budget month row with JSON columns parsed and types validated. */
export interface ParsedBudgetRow {
	id: number;
	month: string;
	totalTargetInCents: number;
	excludedCategoryIds: number[];
	excludedAccountIds: number[];
	excludedTypes: TransactionType[];
	categoryTargets: Record<string, number>;
}

export function parseBudgetRow(
	row: typeof budgetMonths.$inferSelect,
): ParsedBudgetRow {
	return {
		id: row.id,
		month: row.month,
		totalTargetInCents: row.totalTargetInCents,
		excludedCategoryIds: parseJsonCol<number[]>(row.excludedCategoryIds),
		excludedAccountIds: parseJsonCol<number[]>(row.excludedAccountIds),
		excludedTypes: sanitizeExcludedTypes(
			parseJsonCol<string[]>(row.excludedTypes),
		),
		categoryTargets: parseJsonCol<Record<string, number>>(row.categoryTargets),
	};
}

function parseBudgetConfig(
	row: typeof budgetMonths.$inferSelect,
): BudgetConfig {
	const parsed = parseBudgetRow(row);
	return {
		totalTargetInCents: parsed.totalTargetInCents,
		excludedCategoryIds: parsed.excludedCategoryIds,
		excludedAccountIds: parsed.excludedAccountIds,
		excludedTypes: parsed.excludedTypes,
		categoryTargets: parsed.categoryTargets,
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
	const isCurrentMonth =
		now.getFullYear() === year && now.getMonth() + 1 === month;
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
		withUserFilter(userId, accounts),
		gte(accountTransactions.transactionDate, start),
		lte(accountTransactions.transactionDate, end),
		budgetTypeFilter(budget?.excludedTypes ?? []),
	];

	if (budget) {
		if (budget.excludedAccountIds.length > 0) {
			conditions.push(
				notInArray(accountTransactions.accountId, budget.excludedAccountIds),
			);
		}
		if (budget.excludedCategoryIds.length > 0) {
			const excludedCondition = or(
				isNull(accountTransactions.categoryId),
				notInArray(accountTransactions.categoryId, budget.excludedCategoryIds),
			);
			if (excludedCondition) conditions.push(excludedCondition);
		}
	}

	const result = await db
		.select({
			total: spendingSumSql(),
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(and(...conditions));

	const totalSpent = Math.max(0, Number(result[0]?.total ?? 0));
	const avgPerDay = totalSpent / Math.max(daysElapsed, 1);
	const projectedTotal = avgPerDay * totalDays;

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
			withUserFilter(userId, spendingCategories),
			isNull(spendingCategories.deletedAt),
		),
		orderBy: (categories, { asc }) => [asc(categories.name)],
	});

	const conditions = [
		withUserFilter(userId, accounts),
		gte(accountTransactions.transactionDate, start),
		lte(accountTransactions.transactionDate, end),
		budgetTypeFilter(budget?.excludedTypes ?? []),
	];

	if (budget && budget.excludedAccountIds.length > 0) {
		conditions.push(
			notInArray(accountTransactions.accountId, budget.excludedAccountIds),
		);
	}

	const spendRows = await db
		.select({
			categoryId: accountTransactions.categoryId,
			total: spendingSumSql(),
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

export interface UncategorisedTransaction {
	slug: string;
	transactionDate: Date;
	type: TransactionType;
	amount: number;
	description: string | null;
	accountName: string;
	accountSlug: string;
}

/**
 * Uncategorised spending rows for a month (#15 triage): the same conditions
 * as getCategoryBreakdown's uncategorised bucket (month range, budget type
 * filter, excluded accounts) expanded to individual transactions, with
 * account context for the tagging list. Descriptions are decrypted.
 */
export async function getUncategorisedTransactions(
	userId: number,
	year: number,
	month: number,
	budget: BudgetConfig | null,
): Promise<UncategorisedTransaction[]> {
	const { start, end } = getMonthRange(year, month);

	const conditions = [
		withUserFilter(userId, accounts),
		gte(accountTransactions.transactionDate, start),
		lte(accountTransactions.transactionDate, end),
		budgetTypeFilter(budget?.excludedTypes ?? []),
		isNull(accountTransactions.categoryId),
	];

	if (budget && budget.excludedAccountIds.length > 0) {
		conditions.push(
			notInArray(accountTransactions.accountId, budget.excludedAccountIds),
		);
	}

	const rows = await db
		.select({
			slug: accountTransactions.slug,
			transactionDate: accountTransactions.transactionDate,
			type: accountTransactions.type,
			amount: accountTransactions.amount,
			description: accountTransactions.description,
			accountName: accounts.name,
			accountSlug: accounts.slug,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(and(...conditions))
		.orderBy(desc(accountTransactions.transactionDate));

	return rows.map((row) => ({
		...row,
		description: decryptTxDescription(userId, row.slug, row.description),
	}));
}

export interface DailySpendPoint {
	/** Day of month, 1-based. */
	day: number;
	/** Cumulative net spending in pence through end of that day. */
	cumulativePence: number;
}

/**
 * Cumulative daily spend for the burn-down chart (Phase 4 V1 #2): same
 * spending definition as every budget query (withdrawals+charges−refunds,
 * budget type filter, excluded accounts), folded into a running total so
 * the chart shows the actual spend curve vs the linear pace line.
 */
export async function getCumulativeDailySpend(
	userId: number,
	year: number,
	month: number,
	budget: BudgetConfig | null,
): Promise<DailySpendPoint[]> {
	const { start, end } = getMonthRange(year, month);

	const conditions = [
		withUserFilter(userId, accounts),
		gte(accountTransactions.transactionDate, start),
		lte(accountTransactions.transactionDate, end),
		budgetTypeFilter(budget?.excludedTypes ?? []),
	];

	if (budget && budget.excludedAccountIds.length > 0) {
		conditions.push(
			notInArray(accountTransactions.accountId, budget.excludedAccountIds),
		);
	}

	const rows = await db
		.select({
			transactionDate: accountTransactions.transactionDate,
			type: accountTransactions.type,
			amount: accountTransactions.amount,
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(and(...conditions));

	const totalDays = new Date(year, month, 0).getDate();
	const daily = new Array<number>(totalDays + 1).fill(0);
	for (const row of rows) {
		// UTC day-of-month: dates are stored as UTC-midnight timestamps and
		// strftime on this column returns NULL (verified live 2026-10-28),
		// so bucket in JS.
		const day = new Date(row.transactionDate).getUTCDate();
		if (!Number.isInteger(day) || day < 1 || day > totalDays) continue;
		const magnitude = Math.abs(Number(row.amount));
		if (row.type === "refund") {
			daily[day] -= magnitude;
		} else {
			daily[day] += magnitude;
		}
	}

	const out: DailySpendPoint[] = [];
	let running = 0;
	for (let day = 1; day <= totalDays; day++) {
		running += daily[day];
		out.push({ day, cumulativePence: running });
	}
	return out;
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
		.where(withUserFilter(userId, budgetMonths));

	const totalPages = Math.ceil(total / pageSize);

	const months = await db.query.budgetMonths.findMany({
		where: withUserFilter(userId, budgetMonths),
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
				withUserFilter(userId, accounts),
				gte(accountTransactions.transactionDate, start),
				lte(accountTransactions.transactionDate, end),
				budgetTypeFilter(config.excludedTypes),
			];

			if (config.excludedAccountIds.length > 0) {
				conditions.push(
					notInArray(accountTransactions.accountId, config.excludedAccountIds),
				);
			}
			if (config.excludedCategoryIds.length > 0) {
				const excludedCondition = or(
					isNull(accountTransactions.categoryId),
					notInArray(
						accountTransactions.categoryId,
						config.excludedCategoryIds,
					),
				);
				if (excludedCondition) conditions.push(excludedCondition);
			}

			const result = await db
				.select({
					total: spendingSumSql(),
				})
				.from(accountTransactions)
				.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
				.where(and(...conditions));

			return {
				month: row.month,
				totalTarget: row.totalTargetInCents,
				actualSpent: Math.max(0, Number(result[0]?.total ?? 0)),
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
			withUserFilter(userId, budgetMonths),
			eq(budgetMonths.month, monthStr),
		),
	});

	if (existing) return existing;

	const previous = await db.query.budgetMonths.findFirst({
		where: and(
			withUserFilter(userId, budgetMonths),
			sql`${budgetMonths.month} < ${monthStr}`,
		),
		orderBy: desc(budgetMonths.month),
	});

	if (!previous) return null;

	// (user_id, month) is unique — a concurrent roll-forward wins the insert;
	// onConflictDoNothing + re-read returns the surviving row either way.
	const inserted = await db
		.insert(budgetMonths)
		.values({
			userId,
			month: monthStr,
			totalTargetInCents: previous.totalTargetInCents,
			excludedCategoryIds: parseJsonCol<number[]>(previous.excludedCategoryIds),
			excludedAccountIds: parseJsonCol<number[]>(previous.excludedAccountIds),
			excludedTypes: sanitizeExcludedTypes(
				parseJsonCol<string[]>(previous.excludedTypes),
			),
			categoryTargets: parseJsonCol<Record<string, number>>(
				previous.categoryTargets,
			),
		})
		.onConflictDoNothing({
			target: [budgetMonths.userId, budgetMonths.month],
		})
		.returning();

	if (inserted.length > 0) {
		devLog("ensureCurrentMonth", "Rolled budget to new month", {
			from: previous.month,
			to: monthStr,
		});
		return inserted[0];
	}

	const conflictWinner = await db.query.budgetMonths.findFirst({
		where: and(
			withUserFilter(userId, budgetMonths),
			eq(budgetMonths.month, monthStr),
		),
	});
	return conflictWinner ?? null;
}

async function findBudgetRow(
	userId: number,
	monthStr: string,
): Promise<typeof budgetMonths.$inferSelect | null> {
	const row = await db.query.budgetMonths.findFirst({
		where: and(
			withUserFilter(userId, budgetMonths),
			eq(budgetMonths.month, monthStr),
		),
	});
	return row ?? null;
}

/** Config fields a caller may mutate in one write. */
export type BudgetRowUpdates = Partial<
	Pick<
		BudgetMonthsInsert,
		| "totalTargetInCents"
		| "excludedCategoryIds"
		| "excludedAccountIds"
		| "excludedTypes"
		| "categoryTargets"
	>
>;
type BudgetMonthsInsert = typeof budgetMonths.$inferInsert;
type BudgetMonthsSelect = typeof budgetMonths.$inferSelect;

/** One old → new change to record in the amendment trail. */
interface PendingAmendment {
	field: string;
	oldValue: unknown;
	newValue: unknown;
}

/**
 * Diff provided updates against a row's current config.
 * Category targets diff per key (`categoryTarget:<id>`) so inline markers
 * can name the exact category that changed; list/scalar fields diff whole.
 */
function diffBudgetConfig(
	existing: BudgetMonthsSelect,
	updates: BudgetRowUpdates,
): PendingAmendment[] {
	const amendments: PendingAmendment[] = [];

	if (updates.categoryTargets !== undefined) {
		const oldTargets = parseJsonCol<Record<string, number>>(
			existing.categoryTargets,
		);
		const keys = new Set([
			...Object.keys(oldTargets),
			...Object.keys(updates.categoryTargets),
		]);
		for (const key of keys) {
			const old = oldTargets[key] ?? null;
			const updated = updates.categoryTargets[key] ?? null;
			if (old !== updated) {
				amendments.push({
					field: `categoryTarget:${key}`,
					oldValue: old,
					newValue: updated,
				});
			}
		}
	}

	const simpleKeys = [
		"totalTargetInCents",
		"excludedCategoryIds",
		"excludedAccountIds",
		"excludedTypes",
	] as const;
	for (const key of simpleKeys) {
		const value = updates[key];
		if (value === undefined) continue;
		const old = parseJsonCol(existing[key] as number | number[] | string[]);
		if (JSON.stringify(old) !== JSON.stringify(value)) {
			amendments.push({ field: key, oldValue: old, newValue: value });
		}
	}

	return amendments;
}

/**
 * Amend-and-trail write (design decision 5): persist config updates and
 * record every actual change as an amendment row. Creating a row trails
 * each provided field with a null old value (initial set). Unchanged
 * fields are not trailed. Transactions are never touched.
 */
async function writeWithTrail(
	existing: BudgetMonthsSelect | null,
	userId: number,
	monthStr: string,
	updates: BudgetRowUpdates,
	note: string | null,
): Promise<boolean> {
	if (updates.excludedTypes !== undefined) {
		updates.excludedTypes = sanitizeExcludedTypes(updates.excludedTypes);
	}

	const amendments: PendingAmendment[] = existing
		? diffBudgetConfig(existing, updates)
		: (Object.keys(updates) as (keyof BudgetRowUpdates)[])
				.filter((key) => updates[key] !== undefined)
				.map((key) => ({
					field: key,
					oldValue: null,
					newValue: updates[key],
				}));

	let _rowId: number;
	if (existing) {
		if (Object.keys(updates).length === 0) return false;
		db.transaction((tx) => {
			tx.update(budgetMonths)
				.set(updates)
				.where(eq(budgetMonths.id, existing.id))
				.run();
			if (amendments.length > 0) {
				// Explicit createdAt: the column's CURRENT_TIMESTAMP default stores
				// text this driver cannot map back to a Date. Values are stringified
				// by hand — null olds encode as "null" (initial set), never SQL NULL.
				const createdAt = new Date();
				tx.insert(budgetConfigAmendments)
					.values(
						amendments.map((amendment) => ({
							budgetMonthId: existing.id,
							field: amendment.field,
							oldValue: JSON.stringify(amendment.oldValue),
							newValue: JSON.stringify(amendment.newValue),
							note: note?.trim() ? note.trim() : null,
							createdAt,
						})),
					)
					.run();
			}
		});
		_rowId = existing.id;
	} else {
		// Config write + amendment trail commit in ONE transaction — a
		// failing amendment insert rolls the config write back with it.
		const row = db.transaction((tx) => {
			const inserted = tx
				.insert(budgetMonths)
				.values({
					userId,
					month: monthStr,
					totalTargetInCents: updates.totalTargetInCents ?? 0,
					excludedCategoryIds: updates.excludedCategoryIds ?? [],
					excludedAccountIds: updates.excludedAccountIds ?? [],
					excludedTypes: updates.excludedTypes ?? [],
					categoryTargets: updates.categoryTargets ?? {},
				})
				.returning()
				.get();
			if (amendments.length > 0) {
				const createdAt = new Date();
				tx.insert(budgetConfigAmendments)
					.values(
						amendments.map((amendment) => ({
							budgetMonthId: inserted.id,
							field: amendment.field,
							oldValue: JSON.stringify(amendment.oldValue),
							newValue: JSON.stringify(amendment.newValue),
							note: note?.trim() ? note.trim() : null,
							createdAt,
						})),
					)
					.run();
			}
			return inserted;
		});
		_rowId = row.id;
	}

	return amendments.length > 0 || Object.keys(updates).length > 0;
}

/**
 * Mutate a month's budget config through a trail-writing helper (task 4.2).
 * The op receives the row's parsed config and returns the updates to apply.
 * With `applyForward`, the same logical op runs against every later month
 * row (each diffed and trailed individually) — past months are untouched.
 */
export async function amendBudgetConfig(
	userId: number,
	monthStr: string,
	op: (row: ParsedBudgetRow) => BudgetRowUpdates,
	options: { note?: string | null; applyForward?: boolean } = {},
): Promise<{ ok: true; monthsChanged: number } | { ok: false; error: string }> {
	const current = await findBudgetRow(userId, monthStr);
	if (!current) return { ok: false, error: "No budget set for this month" };

	const note = options.note ?? null;
	let monthsChanged = 0;

	const currentUpdates = op(parseBudgetRow(current));
	if (await writeWithTrail(current, userId, monthStr, currentUpdates, note)) {
		monthsChanged++;
	}

	if (options.applyForward) {
		const futureRows = await db.query.budgetMonths.findMany({
			where: and(
				withUserFilter(userId, budgetMonths),
				sql`${budgetMonths.month} > ${monthStr}`,
			),
			orderBy: [asc(budgetMonths.month)],
		});
		for (const row of futureRows) {
			const updates = op(parseBudgetRow(row));
			if (Object.keys(updates).length === 0) continue;
			if (await writeWithTrail(row, userId, row.month, updates, note)) {
				monthsChanged++;
			}
		}
	}

	return { ok: true, monthsChanged };
}

export async function saveBudgetRow(
	userId: number,
	monthStr: string,
	updates: BudgetRowUpdates,
	options: { note?: string | null } = {},
): Promise<void> {
	const existing = await findBudgetRow(userId, monthStr);
	await writeWithTrail(
		existing,
		userId,
		monthStr,
		updates,
		options.note ?? null,
	);
}

export async function getBudgetRow(userId: number, monthStr: string) {
	const row = await ensureCurrentMonth(userId, monthStr);
	if (!row) return null;
	return parseBudgetRow(row);
}

/** Normalise createdAt across driver quirks: Date, ms/seconds number, or
 *  SQLite text timestamps from the column default. */
function toIsoCreatedAt(value: Date | number | string | null): string {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "number") {
		return new Date(value > 1e12 ? value : value * 1000).toISOString();
	}
	if (typeof value === "string") {
		const parsed = new Date(`${value.replace(" ", "T")}Z`);
		if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
	}
	return new Date().toISOString();
}

function mapAmendmentRow(row: {
	id: number;
	month: string;
	field: string;
	oldValue: unknown;
	newValue: unknown;
	note: string | null;
	createdAt: Date | number | string | null;
}): AmendmentTimelineEntry {
	return {
		id: row.id,
		month: row.month,
		field: row.field,
		oldValue:
			typeof row.oldValue === "string"
				? JSON.parse(row.oldValue)
				: row.oldValue,
		newValue:
			typeof row.newValue === "string"
				? JSON.parse(row.newValue)
				: row.newValue,
		note: row.note,
		createdAt: toIsoCreatedAt(row.createdAt),
	};
}

/** Full amendment list for one month, newest first (task 4.4). */
export async function getMonthAmendments(
	userId: number,
	monthStr: string,
): Promise<AmendmentTimelineEntry[]> {
	const rows = await db
		.select({
			id: budgetConfigAmendments.id,
			month: budgetMonths.month,
			field: budgetConfigAmendments.field,
			oldValue: budgetConfigAmendments.oldValue,
			newValue: budgetConfigAmendments.newValue,
			note: budgetConfigAmendments.note,
			createdAt: budgetConfigAmendments.createdAt,
		})
		.from(budgetConfigAmendments)
		.innerJoin(
			budgetMonths,
			eq(budgetConfigAmendments.budgetMonthId, budgetMonths.id),
		)
		.where(
			and(
				withUserFilter(userId, budgetMonths),
				eq(budgetMonths.month, monthStr),
			),
		)
		.orderBy(
			desc(budgetConfigAmendments.createdAt),
			desc(budgetConfigAmendments.id),
		);

	return rows.map(mapAmendmentRow);
}

/** Cross-month amendment timeline, newest first (task 4.5). */
export async function getAmendmentTimeline(
	userId: number,
	limit = 200,
): Promise<AmendmentTimelineEntry[]> {
	const rows = await db
		.select({
			id: budgetConfigAmendments.id,
			month: budgetMonths.month,
			field: budgetConfigAmendments.field,
			oldValue: budgetConfigAmendments.oldValue,
			newValue: budgetConfigAmendments.newValue,
			note: budgetConfigAmendments.note,
			createdAt: budgetConfigAmendments.createdAt,
		})
		.from(budgetConfigAmendments)
		.innerJoin(
			budgetMonths,
			eq(budgetConfigAmendments.budgetMonthId, budgetMonths.id),
		)
		.where(withUserFilter(userId, budgetMonths))
		.orderBy(
			desc(budgetConfigAmendments.createdAt),
			desc(budgetConfigAmendments.id),
		)
		.limit(limit);

	return rows.map(mapAmendmentRow);
}
