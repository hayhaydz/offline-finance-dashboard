import { rm } from "node:fs/promises";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	spendingCategories,
	users,
} from "$lib/db/schema";
import { generateDataKey, unlockKeyring } from "$lib/server/crypto/keyring";
import { decryptTxDescription } from "$lib/server/crypto/protected-fields";
import { TRANSACTION_CSV_HEADER } from "$lib/server/csv-format";
import { buildTransactionsCsv, type ExportOptions } from "./exports";
import { commitReimport, previewReimport } from "./imports-update";

/**
 * R19 + R15 round-trip verification (v3 B06 slice S1).
 *
 * The Matrixify/Altera export-modification contract, proven against REAL
 * export files (never hand-built CSV) across ≥2 accounts:
 *
 *   1. An unmodified export is a valid reimport file (no-op, all skipped).
 *   2. DROP: a row flagged `_delete=1` in the file is deleted in the DB.
 *   3. CREATE: an id-less row in the file is inserted, cross-account.
 *   4. MOVE: drop in account A + create with the same values under account
 *      B's slug relocates the transaction across accounts in one file.
 *   5. Preview and commit resolve the same plan (safety chain parity).
 *   6. Special characters (RFC 4180 doubled quotes, commas) and category
 *      names survive the full export → edit → reimport cycle.
 */

let testUserId: number;
let accountA: { id: number; slug: string };
let accountB: { id: number; slug: string };
let categoryGroceries: { id: number; name: string };
let categoryTravel: { id: number; name: string };

const cleanupAccountIds: number[] = [];
const cleanupUserIds: number[] = [];
const cleanupCategoryIds: number[] = [];

async function insertUser(): Promise<number> {
	const [user] = await db
		.insert(users)
		.values({
			username: `roundtrip-user-${Date.now()}-${nanoid(6)}`,
			passwordHash: "hash",
			passwordSalt: "salt",
		})
		.returning({ id: users.id });
	return user.id;
}

async function insertAccount(userId: number, name: string) {
	const [account] = await db
		.insert(accounts)
		.values({
			slug: nanoid(16),
			userId,
			name,
			type: "current",
			taxWrapper: "none",
			category: "asset",
			closedAt: null,
			excludedFromNetWorth: false,
		})
		.returning({ id: accounts.id, slug: accounts.slug });
	cleanupAccountIds.push(account.id);
	return account;
}

async function insertCategory(userId: number, name: string, key: string) {
	const [category] = await db
		.insert(spendingCategories)
		.values({
			slug: nanoid(16),
			userId,
			name,
			key,
			colour: "#68D391",
			isDefault: false,
		})
		.returning({ id: spendingCategories.id, name: spendingCategories.name });
	cleanupCategoryIds.push(category.id);
	return category;
}

async function insertTx(
	accountId: number,
	type: string,
	amountCents: number,
	date: string,
	description: string,
): Promise<{ id: number; slug: string }> {
	const slug = nanoid(21);
	const [tx] = await db
		.insert(accountTransactions)
		.values({
			slug,
			accountId,
			type: type as never,
			amount: amountCents,
			// Value layer: write encrypted like the app does
			description: null,
			categoryId: null,
			transactionDate: new Date(`${date}T00:00:00.000Z`),
		})
		.returning({ id: accountTransactions.id });
	await db
		.update(accountTransactions)
		.set({
			description: await import("$lib/server/crypto/protected-fields").then(
				(m) => m.encryptTxDescription(testUserId, slug, description),
			),
		})
		.where(eq(accountTransactions.id, tx.id));
	return { id: tx.id, slug };
}

async function getTx(id: number) {
	const [tx] = await db
		.select()
		.from(accountTransactions)
		.where(eq(accountTransactions.id, id));
	if (!tx) return undefined;
	return {
		...tx,
		description: decryptTxDescription(testUserId, tx.slug, tx.description),
	};
}

async function accountRows(accountId: number) {
	const rows = await db
		.select()
		.from(accountTransactions)
		.where(eq(accountTransactions.accountId, accountId));
	return rows.map((tx) => ({
		...tx,
		description: decryptTxDescription(testUserId, tx.slug, tx.description),
	}));
}

/** Both test accounts in one export (the multi-account spreadsheet). */
async function exportBoth(): Promise<string> {
	const options: ExportOptions = {
		accountSlugs: [accountA.slug, accountB.slug],
		from: null,
		to: null,
		type: null,
	};
	const { csv } = await buildTransactionsCsv(testUserId, options);
	return csv;
}

/** Data lines only: comment header lines (R18 legend) + header stripped. */
function dataLines(csv: string): string[] {
	const lines = csv
		.trim()
		.split("\n")
		.filter((line) => !line.startsWith("#"));
	expect(lines[0]).toBe(TRANSACTION_CSV_HEADER);
	return lines;
}

/** Flip a row's trailing empty `_delete` cell to 1 (export rows end `,`). */
function flagDelete(lines: string[], match: (line: string) => boolean): string[] {
	return lines.map((line) =>
		!line.startsWith("#") && match(line) && line.endsWith(",")
			? `${line}1`
			: line,
	);
}

/** Append an insert row (id-less) under a slug. */
function appendInsert(
	lines: string[],
	slug: string,
	date: string,
	type: string,
	amount: string,
	description: string,
): string[] {
	return [
		...lines,
		[slug, "", date, type, amount, JSON.stringify(description), "", ""].join(
			",",
		),
	];
}

beforeAll(async () => {
	testUserId = await insertUser();
	unlockKeyring(testUserId, generateDataKey());
	cleanupUserIds.push(testUserId);
	accountA = await insertAccount(testUserId, "Roundtrip A");
	accountB = await insertAccount(testUserId, "Roundtrip B");
	categoryGroceries = await insertCategory(
		testUserId,
		`Groceries ${nanoid(4)}`,
		`groceries-${nanoid(4).toLowerCase()}`,
	);
	categoryTravel = await insertCategory(
		testUserId,
		`Travel ${nanoid(4)}`,
		`travel-${nanoid(4).toLowerCase()}`,
	);
});

afterAll(async () => {
	for (const id of cleanupAccountIds) {
		await db
			.delete(accountTransactions)
			.where(eq(accountTransactions.accountId, id));
		await db.delete(accounts).where(eq(accounts.id, id));
	}
	await db
		.delete(spendingCategories)
		.where(inArray(spendingCategories.id, cleanupCategoryIds));
	for (const id of cleanupUserIds) {
		await db.delete(users).where(eq(users.id, id));
	}
	await rm(`storage/backups/user-${testUserId}`, {
		recursive: true,
		force: true,
	});
});

describe("S1 round-trip — export is a valid reimport file", () => {
	it("unmodified multi-account export reimports as a no-op (all skipped, no backup, nothing written)", async () => {
		await insertTx(accountA.id, "deposit", 25000, "2026-01-02", "salary jan");
		await insertTx(accountB.id, "charge", -1999, "2026-01-03", "coffee gear");
		const aRowsBefore = await accountRows(accountA.id);
		const bRowsBefore = await accountRows(accountB.id);

		const csv = await exportBoth();
		expect(csv).toContain(accountA.slug);
		expect(csv).toContain(accountB.slug);
		const rows = dataLines(csv).length - 1; // minus header
		expect(rows).toBe(aRowsBefore.length + bRowsBefore.length);

		const result = await commitReimport(testUserId, csv, { recovery: false });
		expect("errors" in result).toBe(false);
		if ("errors" in result) return;
		expect(result.counts.inserted).toBe(0);
		expect(result.counts.edited).toBe(0);
		expect(result.counts.deleted).toBe(0);
		expect(result.counts.skipped).toBe(rows);
		expect(result.backupFilename).toBeNull();

		// Nothing written: identical row sets
		expect(await accountRows(accountA.id)).toHaveLength(aRowsBefore.length);
		expect(await accountRows(accountB.id)).toHaveLength(bRowsBefore.length);
	});

	it("preview of the unmodified export reports the same no-op plan", async () => {
		const csv = await exportBoth();
		const preview = await previewReimport(testUserId, csv, { recovery: false });
		expect(preview.ok).toBe(true);
		if (!preview.ok) return;
		expect(preview.counts.inserted).toBe(0);
		expect(preview.counts.edited).toBe(0);
		expect(preview.counts.deleted).toBe(0);
		expect(preview.isBackup).toBe(false);
	});
});

describe("S1 round-trip — DROP + CREATE across accounts from a real export", () => {
	it("deletes an account-A row and creates an account-B row in one commit", async () => {
		const doomed = await insertTx(
			accountA.id,
			"charge",
			-5400,
			"2026-02-01",
			"mis-entered gym fee",
		);
		await insertTx(accountA.id, "interest", 12, "2026-02-02", "stays put");

		const lines = dataLines(await exportBoth());

		const mutated = appendInsert(
			flagDelete(lines, (line) => line.includes("mis-entered gym fee")),
			accountB.slug,
			"2026-02-05",
			"refund",
			"-54.00",
			"gym refund posted to B",
		);

		const preview = await previewReimport(testUserId, mutated.join("\n"), {
			recovery: false,
		});
		expect(preview.ok).toBe(true);

		const result = await commitReimport(testUserId, mutated.join("\n"), {
			recovery: false,
		});
		expect("errors" in result).toBe(false);
		if ("errors" in result) return;
		expect(result.counts.inserted).toBe(1);
		expect(result.counts.deleted).toBe(1);
		expect(result.backupFilename).not.toBeNull();

		// DROP verified in A
		expect(await getTx(doomed.id)).toBeUndefined();
		// CREATE verified in B
		const bRows = await accountRows(accountB.id);
		const created = bRows.find((tx) => tx.description === "gym refund posted to B");
		expect(created).toBeDefined();
		expect(created?.amount).toBe(-5400);
		expect(created?.type).toBe("refund");
	});
});

describe("S1 round-trip — cross-account MOVE (drop in A, create in B)", () => {
	it("relocates a transaction between accounts in one file, count preserved", async () => {
		const moved = await insertTx(
			accountA.id,
			"withdrawal",
			-1234,
			"2026-03-01",
			"belongs on B really",
		);
		const aBefore = (await accountRows(accountA.id)).length;
		const bBefore = (await accountRows(accountB.id)).length;

		const lines = dataLines(await exportBoth());
		const mutated = appendInsert(
			flagDelete(lines, (line) => line.includes("belongs on B really")),
			accountB.slug,
			"2026-03-01",
			"withdrawal",
			"-12.34",
			"belongs on B really",
		);

		const result = await commitReimport(testUserId, mutated.join("\n"), {
			recovery: false,
		});
		expect("errors" in result).toBe(false);
		if ("errors" in result) return;
		expect(result.counts.deleted).toBe(1);
		expect(result.counts.inserted).toBe(1);

		// Old id gone; same values now under B; net count unchanged
		expect(await getTx(moved.id)).toBeUndefined();
		const aAfter = await accountRows(accountA.id);
		const bAfter = await accountRows(accountB.id);
		expect(aAfter.length).toBe(aBefore - 1);
		expect(bAfter.length).toBe(bBefore + 1);
		const relocated = bAfter.find(
			(tx) => tx.description === "belongs on B really",
		);
		expect(relocated?.amount).toBe(-1234);
		expect(relocated?.type).toBe("withdrawal");
	});
});

describe("S1 round-trip — fidelity through the export format", () => {
	it("commas and doubled quotes in descriptions survive export → edit → reimport", async () => {
		const tricky = 'He said "hi, there", twice';
		const tx = await insertTx(accountA.id, "charge", -1001, "2026-04-01", tricky);

		const csv = await exportBoth();
		// Export must RFC-4180-escape the value
		expect(csv).toContain('"He said ""hi, there"", twice"');

		const lines = dataLines(csv);
		const edited = lines.map((line) =>
			line.includes("He said")
				? line.replace(
						'"He said ""hi, there"", twice"',
						'"She said ""bye, now"", once"',
					)
				: line,
		);

		const result = await commitReimport(testUserId, edited.join("\n"), {
			recovery: false,
		});
		expect("errors" in result).toBe(false);
		if ("errors" in result) return;
		expect(result.counts.edited).toBe(1);

		const row = await getTx(tx.id);
		expect(row?.description).toBe('She said "bye, now", once');
	});

	it("category edits round-trip by name (category cell → categoryId in DB)", async () => {
		const tx = await insertTx(
			accountA.id,
			"charge",
			-4200,
			"2026-05-01",
			"weekly shop",
		);
		await db
			.update(accountTransactions)
			.set({ categoryId: categoryGroceries.id })
			.where(eq(accountTransactions.id, tx.id));

		const csv = await exportBoth();
		expect(csv).toContain(`,${categoryGroceries.name},`);

		const lines = dataLines(csv);
		const edited = lines.map((line) =>
			line.includes(categoryGroceries.name)
				? line.replace(categoryGroceries.name, categoryTravel.name)
				: line,
		);
		const result = await commitReimport(testUserId, edited.join("\n"), {
			recovery: false,
		});
		expect("errors" in result).toBe(false);
		if ("errors" in result) return;
		expect(result.counts.edited).toBeGreaterThanOrEqual(1);

		const [row] = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.id, tx.id));
		expect(row?.categoryId).toBe(categoryTravel.id);
	});
});

describe("S1 round-trip — preview/commit parity (safety chain)", () => {
	it("preview reports the exact plan commit applies on a cross-account file", async () => {
		const dropTarget = await insertTx(
			accountA.id,
			"charge",
			-777,
			"2026-06-01",
			"parity drop",
		);
		await insertTx(accountB.id, "deposit", 321, "2026-06-02", "parity keep");

		const lines = dataLines(await exportBoth());
		const mutated = appendInsert(
			flagDelete(lines, (line) => line.includes("parity drop")),
			accountB.slug,
			"2026-06-03",
			"interest",
			"1.11",
			"parity create",
		);

		const preview = await previewReimport(testUserId, mutated.join("\n"), {
			recovery: false,
		});
		expect(preview.ok).toBe(true);
		if (!preview.ok) return;
		expect(preview.counts.inserted).toBe(1);
		expect(preview.counts.deleted).toBe(1);
		expect(preview.deletes[0]?.id).toBe(dropTarget.id);
		expect(preview.inserts[0]?.accountSlug).toBe(accountB.slug);

		const commit = await commitReimport(testUserId, mutated.join("\n"), {
			recovery: false,
		});
		expect("errors" in commit).toBe(false);
		if ("errors" in commit) return;
		expect(commit.counts).toEqual(preview.counts);
	});
});
