import { fail } from "@sveltejs/kit";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { incomeHistory } from "$lib/db/schema";
import { devLog, logError, logFormData } from "$lib/server/logger";
import { getAuthUser, requireAuth } from "$lib/server/utils/auth-guard";
import { parseCurrency } from "$lib/utils/currency";
import {
	compareTaxYears,
	taxYearLabelFromDate,
	taxYearMonths,
} from "$lib/utils/tax-year-utils";
import type { Actions, PageServerLoad } from "./$types";

const MAX_RANGE_MONTHS = 120;

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

function isValidMonth(month: string): boolean {
	const match = month.match(MONTH_PATTERN);
	if (!match) return false;
	const m = Number(match[2]);
	return m >= 1 && m <= 12;
}

function monthToIndex(month: string): number | null {
	const match = month.match(MONTH_PATTERN);
	if (!match) return null;
	return Number(match[1]) * 12 + (Number(match[2]) - 1);
}

function indexToMonth(index: number): string {
	const year = Math.floor(index / 12);
	const month = (index % 12) + 1;
	return `${year}-${String(month).padStart(2, "0")}`;
}

function taxYearOfMonth(month: string): string {
	const [yearStr, monthStr] = month.split("-");
	const year = Number(yearStr);
	const startYear = Number(monthStr) >= 4 ? year : year - 1;
	return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAuth(locals);

	const rows = await db.query.incomeHistory.findMany({
		where: withUserFilter(user.id, incomeHistory),
		orderBy: [asc(incomeHistory.month)],
		columns: { month: true, grossIncomeInCents: true, note: true },
	});

	const byMonth = new Map(
		rows.map((r) => [r.month, { cents: r.grossIncomeInCents, note: r.note }]),
	);

	// Years: distinct tax years from rows + the current tax year, newest first
	const years = new Set(rows.map((r) => taxYearOfMonth(r.month)));
	years.add(taxYearLabelFromDate(new Date()));
	const sortedYears = Array.from(years).sort((a, b) => compareTaxYears(b, a));

	// Year × month grid — null = unknown (never zero by default)
	const grid = sortedYears.map((taxYear) => ({
		taxYear,
		months: taxYearMonths(taxYear).map((month) => ({
			month,
			amountInCents: byMonth.get(month)?.cents ?? null,
			note: byMonth.get(month)?.note ?? null,
		})),
	}));

	return { grid };
};

export const actions: Actions = {
	/** Save (upsert) a single month. £0 is valid and distinct from missing. */
	saveMonth: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		logFormData("tax-income:saveMonth", Object.fromEntries(formData));

		const month = (formData.get("month") as string)?.trim();
		const amountInput = (formData.get("amount") as string)?.trim();
		const note = (formData.get("note") as string)?.trim() ?? null;

		if (!month || !isValidMonth(month)) {
			return fail(400, { error: "Invalid month (YYYY-MM)" });
		}
		if (amountInput === undefined || amountInput === "") {
			return fail(400, { error: "Amount is required (£0 for no income)" });
		}

		let amountInCents: number;
		try {
			amountInCents = parseCurrency(amountInput);
		} catch {
			return fail(400, { error: "Enter amount like 3200 or 3200.00" });
		}
		if (amountInCents < 0) {
			return fail(400, { error: "Amount cannot be negative" });
		}
		if (note && note.length > 200) {
			return fail(400, { error: "Note must be 200 characters or less" });
		}

		try {
			await db
				.insert(incomeHistory)
				.values({
					userId: user.id,
					month,
					grossIncomeInCents: amountInCents,
					note: note || null,
				})
				.onConflictDoUpdate({
					target: [incomeHistory.userId, incomeHistory.month],
					set: {
						grossIncomeInCents: amountInCents,
						note: note || null,
						updatedAt: new Date(),
					},
				});

			devLog("tax-income:saveMonth", "Month saved", {
				userId: user.id,
				month,
			});
			return { success: true, message: `${month} saved` };
		} catch (err) {
			logError("tax-income:saveMonth", "Failed to save month", err);
			return fail(500, { error: "Failed to save month. Please try again." });
		}
	},

	/** Remove a single month's entry (the month becomes unknown, not £0). */
	removeMonth: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		const month = (formData.get("month") as string)?.trim();

		if (!month || !isValidMonth(month)) {
			return fail(400, { error: "Invalid month (YYYY-MM)" });
		}

		try {
			await db
				.delete(incomeHistory)
				.where(
					and(
						withUserFilter(user.id, incomeHistory),
						eq(incomeHistory.month, month),
					),
				);
			return { success: true, message: `${month} removed (now unknown)` };
		} catch (err) {
			logError("tax-income:removeMonth", "Failed to remove month", err);
			return fail(500, { error: "Failed to remove month. Please try again." });
		}
	},

	/**
	 * Range-fill: write a fixed £/mo to every month in [from, to].
	 * Existing entries are overwritten only after an explicit confirmation
	 * naming the count.
	 */
	rangeFill: async ({ request, locals }) => {
		const user = getAuthUser(locals);
		if (!user) return fail(401, { error: "Authentication required" });

		const formData = await request.formData();
		logFormData("tax-income:rangeFill", Object.fromEntries(formData));

		const fromMonth = (formData.get("fromMonth") as string)?.trim();
		const toMonth = (formData.get("toMonth") as string)?.trim();
		const amountInput = (formData.get("amount") as string)?.trim();
		const confirmed = formData.get("confirmed") === "yes";

		if (!isValidMonth(fromMonth ?? "") || !isValidMonth(toMonth ?? "")) {
			return fail(400, { error: "Invalid from/to month (YYYY-MM)" });
		}

		const fromIndex = monthToIndex(fromMonth);
		const toIndex = monthToIndex(toMonth);
		if (fromIndex === null || toIndex === null || fromIndex > toIndex) {
			return fail(400, { error: '"From" month must not be after "to" month' });
		}
		if (toIndex - fromIndex + 1 > MAX_RANGE_MONTHS) {
			return fail(400, {
				error: `Range too large (max ${MAX_RANGE_MONTHS} months)`,
			});
		}

		let amountInCents: number;
		try {
			amountInCents = parseCurrency(amountInput ?? "");
		} catch {
			return fail(400, { error: "Enter amount like 3200 or 3200.00" });
		}
		if (amountInCents < 0) {
			return fail(400, { error: "Amount cannot be negative" });
		}

		const allMonths: string[] = [];
		for (let i = fromIndex; i <= toIndex; i++) {
			allMonths.push(indexToMonth(i));
		}

		// Existing entries in range (user-scoped)
		const existing = await db.query.incomeHistory.findMany({
			where: and(
				withUserFilter(user.id, incomeHistory),
				gte(incomeHistory.month, fromMonth),
				lte(incomeHistory.month, toMonth),
			),
			columns: { month: true },
		});

		if (existing.length > 0 && !confirmed) {
			return fail(400, {
				error: "confirm",
				confirmRangeFill: {
					count: existing.length,
					fromMonth,
					toMonth,
					amountInCents,
				},
			});
		}

		try {
			await db.transaction(async (tx) => {
				if (existing.length > 0) {
					await tx.delete(incomeHistory).where(
						and(
							withUserFilter(user.id, incomeHistory),
							inArray(
								incomeHistory.month,
								existing.map((r) => r.month),
							),
						),
					);
				}
				await tx.insert(incomeHistory).values(
					allMonths.map((month) => ({
						userId: user.id,
						month,
						grossIncomeInCents: amountInCents,
						note: null,
					})),
				);
			});

			devLog("tax-income:rangeFill", "Range filled", {
				userId: user.id,
				fromMonth,
				toMonth,
				months: allMonths.length,
				overwritten: existing.length,
			});

			return {
				success: true,
				message: `${allMonths.length} month(s) filled at ${(amountInCents / 100).toFixed(2)}/mo${existing.length > 0 ? ` (${existing.length} overwritten)` : ""}`,
			};
		} catch (err) {
			logError("tax-income:rangeFill", "Failed to fill range", err);
			return fail(500, { error: "Failed to fill range. Please try again." });
		}
	},
};
