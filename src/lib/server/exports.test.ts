import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { accounts, accountTransactions, users } from "$lib/db/schema";
import {
	parseBackupHeaderLine,
	TRANSACTION_CSV_HEADER,
} from "$lib/server/csv-format";
import {
	buildTransactionsCsv,
	exportFilename,
	parseExportOptions,
} from "./exports";
import { parseUpdateCsv } from "./imports-update";

let testUserId: number;
let otherUserId: number;
const cleanupAccountIds: number[] = [];
const cleanupUserIds: number[] = [];

async function insertUser(): Promise<number> {
	const [user] = await db
		.insert(users)
		.values({
			username: `exports-user-${Date.now()}-${nanoid(6)}`,
			passwordHash: "hash",
			totpSecret: "secret",
			totpSecretIV: "iv",
			passwordSalt: "salt",
		})
		.returning({ id: users.id });
	return user.id;
}

async function insertAccount(
	userId: number,
	closed = false,
): Promise<{ id: number; slug: string }> {
	const [account] = await db
		.insert(accounts)
		.values({
			slug: nanoid(16),
			userId,
			name: `Export Test ${nanoid(4)}`,
			type: "current",
			taxWrapper: "none",
			category: "asset",
			closedAt: closed ? new Date("2026-01-01T00:00:00.000Z") : null,
			excludedFromNetWorth: false,
		})
		.returning({ id: accounts.id, slug: accounts.slug });
	cleanupAccountIds.push(account.id);
	return account;
}

async function insertTx(
	accountId: number,
	type: string,
	amountCents: number,
	date: string,
	description = "test row",
): Promise<number> {
	const [tx] = await db
		.insert(accountTransactions)
		.values({
			slug: nanoid(21),
			accountId,
			type: type as never,
			amount: amountCents,
			description,
			categoryId: null,
			transactionDate: new Date(`${date}T00:00:00.000Z`),
		})
		.returning({ id: accountTransactions.id });
	return tx.id;
}

function dataRows(csv: string): string[] {
	return csv
		.trim()
		.split("\n")
		.filter((l) => !l.startsWith("#"));
}

function parseRow(line: string): Record<string, string> {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;
	for (const char of line) {
		if (char === '"') inQuotes = !inQuotes;
		else if (char === "," && !inQuotes) {
			fields.push(current);
			current = "";
		} else current += char;
	}
	fields.push(current);
	const keys = TRANSACTION_CSV_HEADER.split(",");
	const row: Record<string, string> = {};
	keys.forEach((k, i) => {
		row[k] = fields[i] ?? "";
	});
	return row;
}

beforeAll(async () => {
	testUserId = await insertUser();
	otherUserId = await insertUser();
	cleanupUserIds.push(testUserId, otherUserId);
});

afterAll(async () => {
	for (const id of cleanupAccountIds) {
		await db
			.delete(accountTransactions)
			.where(eq(accountTransactions.accountId, id));
		await db.delete(accounts).where(eq(accounts.id, id));
	}
	for (const id of cleanupUserIds) {
		await db.delete(users).where(eq(users.id, id));
	}
});

describe("parseExportOptions", () => {
	it("accepts an empty param set (full export)", () => {
		const result = parseExportOptions(new URLSearchParams());
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.options).toEqual({
				accountSlugs: null,
				from: null,
				to: null,
				type: null,
			});
		}
	});

	it("parses accounts, from/to and type together", () => {
		const params = new URLSearchParams(
			"accounts=aa,bb&from=2026-04-06&to=2027-04-05&type=deposit",
		);
		const result = parseExportOptions(params);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.options.accountSlugs).toEqual(["aa", "bb"]);
			expect(result.options.from).toBe("2026-04-06");
			expect(result.options.to).toBe("2027-04-05");
			expect(result.options.type).toBe("deposit");
		}
	});

	it("rejects malformed dates, inverted ranges and unknown types", () => {
		expect(parseExportOptions(new URLSearchParams("from=not-a-date")).ok).toBe(
			false,
		);
		expect(
			parseExportOptions(new URLSearchParams("from=2026-05-01&to=2026-04-01"))
				.ok,
		).toBe(false);
		expect(parseExportOptions(new URLSearchParams("type=fake_type")).ok).toBe(
			false,
		);
	});
});

describe("buildTransactionsCsv", () => {
	it("exports only the requesting user's rows, with correct slugs", async () => {
		const mine = await insertAccount(testUserId);
		const theirs = await insertAccount(otherUserId);
		await insertTx(mine.id, "deposit", 10000, "2026-03-10", "my row");
		await insertTx(theirs.id, "deposit", 99999, "2026-03-11", "their row");

		const { csv, rowCount } = await buildTransactionsCsv(testUserId, {
			accountSlugs: null,
			from: null,
			to: null,
			type: null,
		});

		expect(rowCount).toBeGreaterThanOrEqual(1);
		const rows = dataRows(csv).slice(1).map(parseRow);
		const mineRows = rows.filter((r) => r.account_slug === mine.slug);
		expect(mineRows.length).toBe(1);
		expect(mineRows[0].description).toBe("my row");
		// User scoping: no row ever references the other user's account slug.
		expect(rows.some((r) => r.account_slug === theirs.slug)).toBe(false);
	});

	it("applies account, date-range and type filters", async () => {
		const a = await insertAccount(testUserId);
		const b = await insertAccount(testUserId);
		await insertTx(a.id, "deposit", 100, "2026-03-01", "a-deposit-mar");
		await insertTx(a.id, "withdrawal", -200, "2026-04-15", "a-withdrawal-apr");
		await insertTx(b.id, "deposit", 300, "2026-03-20", "b-deposit-mar");
		await insertTx(b.id, "deposit", 400, "2025-12-31", "b-deposit-2025");

		// Account scope only
		const onlyA = await buildTransactionsCsv(testUserId, {
			accountSlugs: [a.slug],
			from: null,
			to: null,
			type: null,
		});
		expect(
			dataRows(onlyA.csv)
				.slice(1)
				.every((l) => l.startsWith(a.slug)),
		).toBe(true);

		// Date range (2026 tax year)
		const taxYear = await buildTransactionsCsv(testUserId, {
			accountSlugs: null,
			from: "2026-04-06",
			to: "2027-04-05",
			type: null,
		});
		const taxRows = dataRows(taxYear.csv).slice(1).map(parseRow);
		expect(taxRows.length).toBe(1);
		expect(taxRows[0].description).toBe("a-withdrawal-apr");

		// Type filter
		const deposits = await buildTransactionsCsv(testUserId, {
			accountSlugs: [b.slug],
			from: null,
			to: null,
			type: "deposit",
		});
		const depRows = dataRows(deposits.csv).slice(1).map(parseRow);
		expect(depRows.length).toBe(2);
		expect(depRows.every((r) => r.type === "deposit")).toBe(true);

		// Foreign slug simply produces no rows (user filter wins)
		const foreign = await buildTransactionsCsv(testUserId, {
			accountSlugs: ["does-not-exist"],
			from: null,
			to: null,
			type: null,
		});
		expect(dataRows(foreign.csv)).toHaveLength(1); // header only
	});

	it("excludes closed accounts' transactions", async () => {
		const open = await insertAccount(testUserId);
		// Seed first, close after — the DB refuses transactions on closed accounts.
		const closed = await insertAccount(testUserId);
		await insertTx(open.id, "deposit", 100, "2026-02-01", "open-row");
		await insertTx(closed.id, "deposit", 100, "2026-02-01", "closed-row");
		await db
			.update(accounts)
			.set({ closedAt: new Date("2026-01-01T00:00:00.000Z") })
			.where(eq(accounts.id, closed.id));

		const { csv } = await buildTransactionsCsv(testUserId, {
			accountSlugs: null,
			from: null,
			to: null,
			type: null,
		});
		const rows = dataRows(csv).slice(1).map(parseRow);
		expect(rows.some((r) => r.account_slug === closed.slug)).toBe(false);
	});

	it("column parity: the export round-trips through the reimport parser", async () => {
		const a = await insertAccount(testUserId);
		const id1 = await insertTx(
			a.id,
			"deposit",
			12345,
			"2026-05-05",
			"row, with comma",
		);
		const id2 = await insertTx(
			a.id,
			"withdrawal",
			-500,
			"2026-05-06",
			'row "quoted"',
		);

		const { csv } = await buildTransactionsCsv(testUserId, {
			accountSlugs: [a.slug],
			from: "2026-05-01",
			to: "2026-05-31",
			type: null,
		});

		const lines = dataRows(csv);
		expect(lines[0]).toBe(TRANSACTION_CSV_HEADER);

		const parsed = parseUpdateCsv(csv);
		expect(parsed.errors).toEqual([]);
		expect(parsed.rows).toHaveLength(2);

		const byId = new Map(parsed.rows.map((r) => [r.id, r]));
		const row1 = byId.get(id1);
		expect(row1).toBeDefined();
		expect(row1?.accountSlug).toBe(a.slug);
		expect(row1?.date).toBe("2026-05-05");
		expect(row1?.type).toBe("deposit");
		expect(row1?.amount).toBe(123.45);
		expect(row1?.description).toBe("row, with comma");

		const row2 = byId.get(id2);
		expect(row2?.description).toBe('row "quoted"');
		expect(row2?.amount).toBe(-5);
		expect(row2?.deleteFlag).toBe(false);

		// An unedited export is a no-op: every row previews as skipped.
		const untouched = await buildTransactionsCsv(testUserId, {
			accountSlugs: [a.slug],
			from: null,
			to: null,
			type: null,
		});
		const reparsed = parseUpdateCsv(untouched.csv);
		// Rows added by other tests in this account set are all id-rows that
		// still match the DB — none may fail parsing.
		expect(reparsed.errors).toEqual([]);
	});
});

describe("export + backup format helpers", () => {
	it("generates a timestamped download filename", () => {
		const name = exportFilename(new Date("2026-07-18T10:15:30.500Z"));
		expect(name).toBe("transactions-20260718T101530Z.csv");
	});

	it("detects backup header lines", () => {
		expect(
			parseBackupHeaderLine(
				"# backup of 5 touched rows at 2026-10-18T09:00:00.000Z",
			),
		).toEqual({
			scope: "5 touched rows",
			timestamp: "2026-10-18T09:00:00.000Z",
		});
		expect(parseBackupHeaderLine("# transactions export")).toBeNull();
	});
});
