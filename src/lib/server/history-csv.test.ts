import { rm } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { expensesHistory, incomeHistory, users } from "$lib/db/schema";
import {
	buildHistoryCsv,
	commitHistoryImport,
	HISTORY_CSV_HEADER,
	historyExportFilename,
	parseHistoryCsv,
	previewHistoryImport,
} from "./history-csv";

/**
 * v3 B06 slice S3 (R23): expenses + income history CSV export AND import,
 * Matrixify-style round-trip keyed by month. Hand-computed expectations.
 */

let testUserId: number;
let otherUserId: number;
const cleanupUserIds: number[] = [];

async function insertUser(): Promise<number> {
	const [user] = await db
		.insert(users)
		.values({
			username: `history-user-${Date.now()}-${nanoid(6)}`,
			passwordHash: "hash",
			passwordSalt: "salt",
		})
		.returning({ id: users.id });
	return user.id;
}

async function seedExpenses(
	userId: number,
	month: string,
	cents: number,
	note: string | null = null,
) {
	await db
		.insert(expensesHistory)
		.values({ userId, month, monthlyExpensesInCents: cents, note });
}

async function seedIncome(
	userId: number,
	month: string,
	cents: number,
	note: string | null = null,
) {
	await db
		.insert(incomeHistory)
		.values({ userId, month, grossIncomeInCents: cents, note });
}

async function expensesRow(userId: number, month: string) {
	const [row] = await db
		.select()
		.from(expensesHistory)
		.where(
			and(eq(expensesHistory.userId, userId), eq(expensesHistory.month, month)),
		);
	return row;
}

async function incomeRow(userId: number, month: string) {
	const [row] = await db
		.select()
		.from(incomeHistory)
		.where(and(eq(incomeHistory.userId, userId), eq(incomeHistory.month, month)));
	return row;
}

function monthRow(
	month: string,
	amount: string,
	note = "",
	deleteFlag = "",
): string {
	return [month, amount, JSON.stringify(note), deleteFlag].join(",");
}

beforeAll(async () => {
	testUserId = await insertUser();
	otherUserId = await insertUser();
	cleanupUserIds.push(testUserId, otherUserId);
});

afterAll(async () => {
	for (const id of cleanupUserIds) {
		await db.delete(expensesHistory).where(eq(expensesHistory.userId, id));
		await db.delete(incomeHistory).where(eq(incomeHistory.userId, id));
	}
	for (const id of cleanupUserIds) {
		await db.delete(users).where(eq(users.id, id));
	}
	await rm(`storage/backups/user-${testUserId}`, {
		recursive: true,
		force: true,
	});
});

describe("parseHistoryCsv", () => {
	it("parses rows, strips comments and detects the kind marker", () => {
		const csv = [
			"# offline-finance history export — 2026-10-29T22:00:00.000Z",
			"# kind: expenses",
			HISTORY_CSV_HEADER,
			monthRow("2026-01", "2000.00", "post-move"),
			monthRow("2026-02", "0.00", "", "1"),
		].join("\n");
		const parsed = parseHistoryCsv(csv);
		expect(parsed.errors).toEqual([]);
		expect(parsed.kind).toBe("expenses");
		expect(parsed.rows).toHaveLength(2);
		expect(parsed.rows[0]?.amount).toBe(2000);
		expect(parsed.rows[1]?.deleteFlag).toBe(true);
	});

	it("refuses bad months, negative amounts, bad flags and duplicate months with row numbers", async () => {
		const csv = [
			HISTORY_CSV_HEADER,
			monthRow("2026-1", "100.00"),
			monthRow("2026-13", "100.00"),
			monthRow("2026-03", "-5.00"),
			monthRow("2026-04", "100.00", "", "maybe"),
		].join("\n");
		const parsed = parseHistoryCsv(csv);
		expect(parsed.rows).toHaveLength(0);
		const messages = parsed.errors.join("\n");
		expect(messages).toContain("Row 1: month");
		expect(messages).toContain("Row 2: month");
		expect(messages).toContain("Row 3: amount");
		expect(messages).toContain("Row 4: _delete");

		const dup = await previewHistoryImport(
			testUserId,
			"expenses",
			[
				HISTORY_CSV_HEADER,
				monthRow("2026-05", "1.00"),
				monthRow("2026-05", "2.00"),
			].join("\n"),
		);
		expect(dup.ok).toBe(false);
		if (!dup.ok) {
			expect(dup.errors.join("\n")).toContain("appears again");
		}
	});

	it("refuses a kind mismatch against the import target", async () => {
		const csv = [
			"# kind: income",
			HISTORY_CSV_HEADER,
			monthRow("2026-01", "100.00"),
		].join("\n");
		const result = await previewHistoryImport(testUserId, "expenses", csv);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors[0]).toContain("kind 'income'");
		}
	});
});

describe("history export", () => {
	it("exports both kinds self-described, month-ordered", async () => {
		await seedExpenses(testUserId, "2026-01", 200000, "a");
		await seedExpenses(testUserId, "2026-03", 150000);
		const { csv, meta } = await buildHistoryCsv(testUserId, "expenses");
		expect(csv).toContain("# kind: expenses");
		expect(csv).toContain("months 2026-01 → 2026-03");
		expect(meta.rowCount).toBe(2);
		expect(meta.firstMonth).toBe("2026-01");
		expect(meta.lastMonth).toBe("2026-03");
		const dataLines = csv
			.trim()
			.split("\n")
			.filter((l) => !l.startsWith("#"));
		expect(dataLines[0]).toBe(HISTORY_CSV_HEADER);
		expect(dataLines[1]).toContain("2026-01,2000.00");
		expect(historyExportFilename("expenses", new Date("2026-10-29T22:00:00.000Z"))).toBe(
			"expenses-history-20261029T220000Z.csv",
		);
	});
});

describe("history round-trip (export → mutate → import → verify)", () => {
	it("unmodified export reimports as a no-op (all skipped)", async () => {
		const { csv } = await buildHistoryCsv(testUserId, "expenses");
		const result = await commitHistoryImport(testUserId, "expenses", csv);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.counts).toEqual({
				inserted: 0,
				edited: 0,
				deleted: 0,
				skipped: 2,
			});
			expect(result.backupFilename).toBeNull();
		}
	});

	it("edit + delete + insert from a real export file, counts and DB verified", async () => {
		await seedExpenses(testUserId, "2026-05", 100000, "edit me"); // 1000.00
		await seedExpenses(testUserId, "2026-06", 50000, "delete me"); // 500.00
		await seedExpenses(testUserId, "2026-07", 75000, "keep me"); // 750.00

		const { csv } = await buildHistoryCsv(testUserId, "expenses");
		const lines = csv
			.trim()
			.split("\n")
			.filter((l) => !l.startsWith("#"));
		const mutated = lines
			.map((line) =>
				line.startsWith("2026-05,")
					? monthRow("2026-05", "1100.00", "edited")
					: line,
			)
			.map((line) =>
				line.startsWith("2026-06,") ? monthRow("2026-06", "500.00", "delete me", "1") : line,
			);
		mutated.push(monthRow("2026-08", "250.00", "brand new"));

		const preview = await previewHistoryImport(
			testUserId,
			"expenses",
			mutated.join("\n"),
		);
		expect(preview.ok).toBe(true);
		if (!preview.ok) return;
		expect(preview.counts).toEqual({
			inserted: 1,
			edited: 1,
			deleted: 1,
			skipped: 3, // 2026-01, 2026-03 (earlier tests) + 2026-07
		});

		const result = await commitHistoryImport(
			testUserId,
			"expenses",
			mutated.join("\n"),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.counts).toEqual(preview.counts);
		expect(result.backupFilename).not.toBeNull();

		// Edit applied
		const edited = await expensesRow(testUserId, "2026-05");
		expect(edited?.monthlyExpensesInCents).toBe(110000);
		expect(edited?.note).toBe("edited");
		// Delete applied (month unknown again)
		expect(await expensesRow(testUserId, "2026-06")).toBeUndefined();
		// Insert applied
		const inserted = await expensesRow(testUserId, "2026-08");
		expect(inserted?.monthlyExpensesInCents).toBe(25000);
		// Untouched
		expect((await expensesRow(testUserId, "2026-07"))?.note).toBe("keep me");
	});

	it("income kind round-trips through its own table", async () => {
		await seedIncome(testUserId, "2026-11", 300000, "salary");
		const { csv } = await buildHistoryCsv(testUserId, "income");
		const lines = csv
			.trim()
			.split("\n")
			.filter((l) => !l.startsWith("#"));
		const mutated = lines.map((line) =>
			line.startsWith("2026-11,")
				? monthRow("2026-11", "3200.00", "salary + bonus")
				: line,
		);
		const result = await commitHistoryImport(
			testUserId,
			"income",
			mutated.join("\n"),
		);
		expect(result.ok).toBe(true);
		const row = await incomeRow(testUserId, "2026-11");
		expect(row?.grossIncomeInCents).toBe(320000);
		expect(row?.note).toBe("salary + bonus");
		// Expenses table untouched by the income import
		expect(await expensesRow(testUserId, "2026-11")).toBeUndefined();
	});

	it("restores from its pre-state backup (backup file is a valid import)", async () => {
		await seedExpenses(testUserId, "2026-09", 88800, "to restore"); // 888.00
		const { csv } = await buildHistoryCsv(testUserId, "expenses");
		const lines = csv
			.trim()
			.split("\n")
			.filter((l) => !l.startsWith("#"));
		const mutated = lines.map((line) =>
			line.startsWith("2026-09,") ? monthRow("2026-09", "0.00", "wrecked") : line,
		);
		const wrecked = await commitHistoryImport(
			testUserId,
			"expenses",
			mutated.join("\n"),
		);
		expect(wrecked.ok).toBe(true);
		expect((await expensesRow(testUserId, "2026-09"))?.note).toBe("wrecked");

		if (!wrecked.ok || !wrecked.backupFilename) throw new Error("no backup");
		const { readFile } = await import("node:fs/promises");
		const { backupDir } = await import("./imports-update");
		const backupText = await readFile(
			`${backupDir(testUserId)}/${wrecked.backupFilename}`,
			"utf-8",
		);
		// Plaintext (matches DB storage level) + carries the kind marker
		expect(backupText).toContain("# kind: expenses");
		expect(backupText).toContain("2026-09,888.00");

		const restored = await commitHistoryImport(
			testUserId,
			"expenses",
			backupText,
		);
		expect(restored.ok).toBe(true);
		const row = await expensesRow(testUserId, "2026-09");
		expect(row?.monthlyExpensesInCents).toBe(88800);
		expect(row?.note).toBe("to restore");
	});

	it("never touches another user's months", async () => {
		await seedExpenses(otherUserId, "2026-02", 100);
		const csv = [
			"# kind: expenses",
			HISTORY_CSV_HEADER,
			monthRow("2026-02", "999.00", "hijack"),
		].join("\n");
		// Importing as testUser upserts only testUser's row
		const result = await commitHistoryImport(testUserId, "expenses", csv);
		expect(result.ok).toBe(true);
		const mine = await expensesRow(testUserId, "2026-02");
		expect(mine?.monthlyExpensesInCents).toBe(99900);
		// Other user's row is unchanged (and still unique to them)
		const theirs = await db
			.select()
			.from(expensesHistory)
			.where(eq(expensesHistory.userId, otherUserId));
		expect(theirs.every((r) => r.monthlyExpensesInCents === 100)).toBe(true);
	});

	it("delete of an unknown month is an idempotent skip", async () => {
		const csv = [
			HISTORY_CSV_HEADER,
			monthRow("2030-12", "10.00", "", "1"),
		].join("\n");
		const result = await commitHistoryImport(testUserId, "expenses", csv);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.counts).toEqual({
				inserted: 0,
				edited: 0,
				deleted: 0,
				skipped: 1,
			});
			expect(result.backupFilename).toBeNull();
		}
	});
});
