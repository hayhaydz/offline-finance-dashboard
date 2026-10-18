import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { expensesHistory, users } from "$lib/db/schema";
import {
	currentMonth,
	indexToMonth,
	monthToIndex,
} from "$lib/utils/month-grid";
import {
	getExpensesGrid,
	getLatestMonthlyExpenses,
	rangeFill,
	removeMonth,
	upsertMonth,
} from "./expenses-history";

function shiftMonth(month: string, delta: number): string {
	const idx = monthToIndex(month);
	if (idx === null) throw new Error("bad month");
	return indexToMonth(idx + delta);
}

describe("Expenses history", () => {
	let testUserId: number;
	let otherUserId: number;
	let createdUserIds: number[] = [];

	beforeEach(async () => {
		const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		const [user] = await db
			.insert(users)
			.values({
				username: `test-expenses-${suffix}`,
				passwordHash: "hash",
				totpSecret: "secret",
				totpSecretIV: "iv",
				passwordSalt: "salt",
				taxBand: "basic",
			})
			.returning();
		testUserId = user.id;
		const [other] = await db
			.insert(users)
			.values({
				username: `test-expenses-other-${suffix}`,
				passwordHash: "hash",
				totpSecret: "secret",
				totpSecretIV: "iv",
				passwordSalt: "salt",
				taxBand: "basic",
			})
			.returning();
		otherUserId = other.id;
		createdUserIds.push(user.id, other.id);
	});

	afterEach(async () => {
		await db
			.delete(expensesHistory)
			.where(
				createdUserIds.length
					? inArray(expensesHistory.userId, createdUserIds)
					: eq(expensesHistory.userId, -1),
			);
		for (const userId of createdUserIds) {
			await db.delete(users).where(eq(users.id, userId));
		}
		createdUserIds = [];
	});

	describe("zero-vs-unknown semantics", () => {
		it("treats a £0 row as known, distinct from a missing month", async () => {
			const month = shiftMonth(currentMonth(), -2);
			const result = await upsertMonth(testUserId, month, "0");
			expect(result.ok).toBe(true);

			const grid = await getExpensesGrid(testUserId);
			const yearRow = grid.find((y) => y.year === month.slice(0, 4));
			expect(yearRow).toBeDefined();
			const zeroCell = yearRow?.months.find((m) => m.month === month);
			expect(zeroCell?.amountInCents).toBe(0);

			const missingCell = yearRow?.months.find(
				(m) => m.month === shiftMonth(month, -1),
			);
			expect(missingCell?.amountInCents).toBeNull();
		});

		it("keeps a removed month unknown rather than £0", async () => {
			const month = shiftMonth(currentMonth(), -1);
			await upsertMonth(testUserId, month, "1500");
			const removed = await removeMonth(testUserId, month);
			expect(removed.ok).toBe(true);

			const rows = await db.query.expensesHistory.findMany({
				where: eq(expensesHistory.userId, testUserId),
			});
			expect(rows).toHaveLength(0);
		});
	});

	describe("latest known resolution", () => {
		it("resolves the most recent month at or before the current month", async () => {
			await upsertMonth(testUserId, shiftMonth(currentMonth(), -2), "1800");
			await upsertMonth(testUserId, shiftMonth(currentMonth(), -1), "2100");

			const latest = await getLatestMonthlyExpenses(testUserId);
			expect(latest?.month).toBe(shiftMonth(currentMonth(), -1));
			expect(latest?.amountInCents).toBe(210000);
		});

		it("accepts £0 as a valid latest value", async () => {
			await upsertMonth(testUserId, shiftMonth(currentMonth(), -1), "0");
			const latest = await getLatestMonthlyExpenses(testUserId);
			expect(latest?.amountInCents).toBe(0);
		});

		it("ignores future-only months and returns null", async () => {
			await upsertMonth(testUserId, shiftMonth(currentMonth(), 2), "1800");
			const latest = await getLatestMonthlyExpenses(testUserId);
			expect(latest).toBeNull();
		});
	});

	describe("range fill", () => {
		it("rejects from-after-to ranges", async () => {
			const result = await rangeFill(
				testUserId,
				"2026-06",
				"2026-01",
				"2000",
				false,
			);
			expect(result.ok).toBe(false);
		});

		it("rejects ranges larger than 120 months", async () => {
			const result = await rangeFill(
				testUserId,
				"2010-01",
				"2026-01",
				"2000",
				false,
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error).toContain("120");
		});

		it("rejects negative amounts", async () => {
			const result = await rangeFill(
				testUserId,
				"2026-01",
				"2026-03",
				"-5",
				false,
			);
			expect(result.ok).toBe(false);
		});

		it("writes every month in range when no entries exist", async () => {
			const result = await rangeFill(
				testUserId,
				"2025-01",
				"2025-04",
				"2000",
				false,
			);
			expect(result.ok, JSON.stringify(result)).toBe(true);

			const rows = await db.query.expensesHistory.findMany({
				where: eq(expensesHistory.userId, testUserId),
			});
			expect(rows).toHaveLength(4);
			for (const row of rows) {
				expect(row.monthlyExpensesInCents).toBe(200000);
			}
		});

		it("requires confirmation before overwriting existing entries", async () => {
			await upsertMonth(testUserId, "2025-02", "999");

			const first = await rangeFill(
				testUserId,
				"2025-01",
				"2025-03",
				"2000",
				false,
			);
			expect(first.ok).toBe(false);
			if (!first.ok && "confirmRangeFill" in first) {
				expect(first.confirmRangeFill.count).toBe(1);
			}

			const second = await rangeFill(
				testUserId,
				"2025-01",
				"2025-03",
				"2000",
				true,
			);
			expect(second.ok).toBe(true);

			const rows = await db.query.expensesHistory.findMany({
				where: eq(expensesHistory.userId, testUserId),
			});
			expect(rows).toHaveLength(3);
			const february = rows.find((r) => r.month === "2025-02");
			expect(february?.monthlyExpensesInCents).toBe(200000);
		});
	});

	describe("user scoping", () => {
		it("does not leak another user's rows into the grid", async () => {
			await upsertMonth(otherUserId, shiftMonth(currentMonth(), -1), "5000");

			const grid = await getExpensesGrid(testUserId);
			for (const year of grid) {
				for (const cell of year.months) {
					expect(cell.amountInCents).toBeNull();
				}
			}

			const latest = await getLatestMonthlyExpenses(testUserId);
			expect(latest).toBeNull();
		});

		it("scoped remove does not delete another user's row", async () => {
			const month = shiftMonth(currentMonth(), -1);
			await upsertMonth(testUserId, month, "1000");
			await upsertMonth(otherUserId, month, "2000");

			await removeMonth(testUserId, month);

			const surviving = await db.query.expensesHistory.findMany({
				where: eq(expensesHistory.userId, otherUserId),
			});
			expect(surviving).toHaveLength(1);
			expect(surviving[0].monthlyExpensesInCents).toBe(200000);
		});
	});

	describe("upsert semantics", () => {
		it("updates an existing month rather than duplicating it", async () => {
			const month = shiftMonth(currentMonth(), -1);
			await upsertMonth(testUserId, month, "1000", "first");
			const result = await upsertMonth(testUserId, month, "1250.50", "second");
			expect(result.ok).toBe(true);

			const rows = await db.query.expensesHistory.findMany({
				where: eq(expensesHistory.userId, testUserId),
			});
			expect(rows).toHaveLength(1);
			expect(rows[0].monthlyExpensesInCents).toBe(125050);
			expect(rows[0].note).toBe("second");
		});

		it("rejects invalid months and empty amounts", async () => {
			const badMonth = await upsertMonth(testUserId, "2026-13", "100");
			expect(badMonth.ok).toBe(false);

			const emptyAmount = await upsertMonth(testUserId, "2026-05", "");
			expect(emptyAmount.ok).toBe(false);
		});
	});
});
