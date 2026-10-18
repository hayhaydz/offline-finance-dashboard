import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { expensesHistory } from "$lib/db/schema";
import { devLog, logError } from "$lib/server/logger";
import { parseCurrency } from "$lib/utils/currency";
import {
	currentMonth,
	indexToMonth,
	isValidMonth,
	monthToIndex,
} from "$lib/utils/month-grid";

/**
 * Expenses history — month-keyed, user-scoped record of declared monthly
 * expenses. Mirrors the income-history semantics: a present row means the
 * month is known (including £0); an absent row means unknown.
 */

export const MAX_RANGE_MONTHS = 120;
const MAX_NOTE_LENGTH = 200;

export interface ExpensesMonthCell {
	month: string; // "YYYY-MM"
	amountInCents: number | null; // null = unknown
	note: string | null;
}

export interface ExpensesYearRow {
	year: string; // "2026"
	months: ExpensesMonthCell[]; // Jan–Dec
}

export interface LatestMonthlyExpenses {
	month: string;
	amountInCents: number;
}

export type ExpensesActionResult =
	| { ok: true; message: string }
	| { ok: false; error: string };

export interface RangeFillConfirmation {
	count: number;
	fromMonth: string;
	toMonth: string;
	amountInCents: number;
}

export type RangeFillResult =
	| ExpensesActionResult
	| { ok: false; error: "confirm"; confirmRangeFill: RangeFillConfirmation };

/** Calendar-year × month grid, newest year first, current year always present. */
export async function getExpensesGrid(
	userId: number,
): Promise<ExpensesYearRow[]> {
	const rows = await db.query.expensesHistory.findMany({
		where: withUserFilter(userId, expensesHistory),
		orderBy: [asc(expensesHistory.month)],
		columns: { month: true, monthlyExpensesInCents: true, note: true },
	});

	const byMonth = new Map(
		rows.map((r) => [
			r.month,
			{ cents: r.monthlyExpensesInCents, note: r.note },
		]),
	);

	const years = new Set(rows.map((r) => r.month.slice(0, 4)));
	years.add(currentMonth().slice(0, 4));
	const sortedYears = Array.from(years).sort((a, b) => b.localeCompare(a));

	return sortedYears.map((year) => ({
		year,
		months: Array.from({ length: 12 }, (_, i) => {
			const month = `${year}-${String(i + 1).padStart(2, "0")}`;
			return {
				month,
				amountInCents: byMonth.get(month)?.cents ?? null,
				note: byMonth.get(month)?.note ?? null,
			};
		}),
	}));
}

/**
 * Most recent record whose month is not after the current month.
 * A £0 record is a valid latest value; absence resolves to null.
 */
export async function getLatestMonthlyExpenses(
	userId: number,
): Promise<LatestMonthlyExpenses | null> {
	const rows = await db.query.expensesHistory.findFirst({
		where: and(
			withUserFilter(userId, expensesHistory),
			lte(expensesHistory.month, currentMonth()),
		),
		orderBy: [desc(expensesHistory.month)],
		columns: { month: true, monthlyExpensesInCents: true },
	});

	return rows
		? { month: rows.month, amountInCents: rows.monthlyExpensesInCents }
		: null;
}

/** Upsert a single month. £0 is valid and distinct from removing the entry. */
export async function upsertMonth(
	userId: number,
	month: string,
	amountInput: string,
	note?: string | null,
): Promise<ExpensesActionResult> {
	const trimmedNote = note?.trim() ?? null;

	if (!isValidMonth(month ?? "")) {
		return { ok: false, error: "Invalid month (YYYY-MM)" };
	}
	if (amountInput === undefined || amountInput === "") {
		return { ok: false, error: "Amount is required (£0 for no expenses)" };
	}

	let amountInCents: number;
	try {
		amountInCents = parseCurrency(amountInput);
	} catch {
		return { ok: false, error: "Enter amount like 2000 or 2000.00" };
	}
	if (amountInCents < 0) {
		return { ok: false, error: "Amount cannot be negative" };
	}
	if (trimmedNote && trimmedNote.length > MAX_NOTE_LENGTH) {
		return { ok: false, error: "Note must be 200 characters or less" };
	}

	try {
		await db
			.insert(expensesHistory)
			.values({
				userId,
				month,
				monthlyExpensesInCents: amountInCents,
				note: trimmedNote || null,
			})
			.onConflictDoUpdate({
				target: [expensesHistory.userId, expensesHistory.month],
				set: {
					monthlyExpensesInCents: amountInCents,
					note: trimmedNote || null,
					updatedAt: new Date(),
				},
			});

		devLog("expenses-history:upsertMonth", "Month saved", { userId, month });
		return { ok: true, message: `${month} saved` };
	} catch (err) {
		logError("expenses-history:upsertMonth", "Failed to save month", err);
		return { ok: false, error: "Failed to save month. Please try again." };
	}
}

/** Remove a single month's entry (the month becomes unknown, not £0). */
export async function removeMonth(
	userId: number,
	month: string,
): Promise<ExpensesActionResult> {
	if (!isValidMonth(month ?? "")) {
		return { ok: false, error: "Invalid month (YYYY-MM)" };
	}

	try {
		await db
			.delete(expensesHistory)
			.where(
				and(
					withUserFilter(userId, expensesHistory),
					eq(expensesHistory.month, month),
				),
			);

		return { ok: true, message: `${month} removed (now unknown)` };
	} catch (err) {
		logError("expenses-history:removeMonth", "Failed to remove month", err);
		return { ok: false, error: "Failed to remove month. Please try again." };
	}
}

/**
 * Range-fill: write a fixed £/mo to every month in [from, to].
 * Existing entries are overwritten only after an explicit confirmation
 * naming the count.
 */
export async function rangeFill(
	userId: number,
	fromMonth: string,
	toMonth: string,
	amountInput: string,
	confirmed: boolean,
): Promise<RangeFillResult> {
	if (!isValidMonth(fromMonth ?? "") || !isValidMonth(toMonth ?? "")) {
		return { ok: false, error: "Invalid from/to month (YYYY-MM)" };
	}

	const fromIndex = monthToIndex(fromMonth);
	const toIndex = monthToIndex(toMonth);
	if (fromIndex === null || toIndex === null || fromIndex > toIndex) {
		return { ok: false, error: '"From" month must not be after "to" month' };
	}
	if (toIndex - fromIndex + 1 > MAX_RANGE_MONTHS) {
		return {
			ok: false,
			error: `Range too large (max ${MAX_RANGE_MONTHS} months)`,
		};
	}

	let amountInCents: number;
	try {
		amountInCents = parseCurrency(amountInput ?? "");
	} catch {
		return { ok: false, error: "Enter amount like 2000 or 2000.00" };
	}
	if (amountInCents < 0) {
		return { ok: false, error: "Amount cannot be negative" };
	}

	const allMonths: string[] = [];
	for (let i = fromIndex; i <= toIndex; i++) {
		allMonths.push(indexToMonth(i));
	}

	// Existing entries in range (user-scoped)
	const existing = await db.query.expensesHistory.findMany({
		where: and(
			withUserFilter(userId, expensesHistory),
			gte(expensesHistory.month, fromMonth),
			lte(expensesHistory.month, toMonth),
		),
		columns: { month: true },
	});

	if (existing.length > 0 && !confirmed) {
		return {
			ok: false,
			error: "confirm",
			confirmRangeFill: {
				count: existing.length,
				fromMonth,
				toMonth,
				amountInCents,
			},
		};
	}

	try {
		// Sync callback: the better-sqlite3 driver rejects async
		// transaction functions ("cannot return a promise").
		db.transaction((tx) => {
			if (existing.length > 0) {
				tx.delete(expensesHistory)
					.where(
						and(
							withUserFilter(userId, expensesHistory),
							inArray(
								expensesHistory.month,
								existing.map((r) => r.month),
							),
						),
					)
					.run();
			}
			tx.insert(expensesHistory)
				.values(
					allMonths.map((month) => ({
						userId,
						month,
						monthlyExpensesInCents: amountInCents,
						note: null,
					})),
				)
				.run();
		});

		devLog("expenses-history:rangeFill", "Range filled", {
			userId,
			fromMonth,
			toMonth,
			months: allMonths.length,
			overwritten: existing.length,
		});

		return {
			ok: true,
			message: `${allMonths.length} month(s) filled at ${(amountInCents / 100).toFixed(2)}/mo${existing.length > 0 ? ` (${existing.length} overwritten)` : ""}`,
		};
	} catch (err) {
		logError("expenses-history:rangeFill", "Failed to fill range", err);
		return { ok: false, error: "Failed to fill range. Please try again." };
	}
}
