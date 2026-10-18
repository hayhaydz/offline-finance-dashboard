import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { accounts, accountTransactions, users } from "$lib/db/schema";
import { parseBackupHeaderLine } from "$lib/server/csv-format";
import { buildTransactionsCsv } from "./exports";
import {
	backupDir,
	commitReimport,
	parseUpdateCsv,
	previewReimport,
	readBackupFile,
} from "./imports-update";

let testUserId: number;
let otherUserId: number;
let accountA: { id: number; slug: string };
let accountB: { id: number; slug: string };
const cleanupAccountIds: number[] = [];
const cleanupUserIds: number[] = [];

async function insertUser(): Promise<number> {
	const [user] = await db
		.insert(users)
		.values({
			username: `reimport-user-${Date.now()}-${nanoid(6)}`,
			passwordHash: "hash",
			totpSecret: "secret",
			totpSecretIV: "iv",
			passwordSalt: "salt",
		})
		.returning({ id: users.id });
	return user.id;
}

async function insertAccount(userId: number): Promise<{
	id: number;
	slug: string;
}> {
	const [account] = await db
		.insert(accounts)
		.values({
			slug: nanoid(16),
			userId,
			name: `Reimport Test ${nanoid(4)}`,
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

async function insertTx(
	accountId: number,
	type: string,
	amountCents: number,
	date: string,
	description = "original",
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

async function getTx(id: number) {
	const [tx] = await db
		.select()
		.from(accountTransactions)
		.where(eq(accountTransactions.id, id));
	return tx;
}

function csvLine(
	slug: string,
	id: string,
	date: string,
	type: string,
	amount: string,
	description: string,
	deleteFlag = "",
): string {
	return [
		slug,
		id,
		date,
		type,
		amount,
		JSON.stringify(description),
		"",
		deleteFlag,
	].join(",");
}

const HEADER = "account_slug,id,date,type,amount,description,category,_delete";

beforeAll(async () => {
	testUserId = await insertUser();
	otherUserId = await insertUser();
	cleanupUserIds.push(testUserId, otherUserId);
	accountA = await insertAccount(testUserId);
	accountB = await insertAccount(testUserId);
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
	await rm(backupDir(testUserId), { recursive: true, force: true });
	await rm(backupDir(otherUserId), { recursive: true, force: true });
});

describe("parseUpdateCsv", () => {
	it("parses rows and validates fields with append-import rules", () => {
		const csv = [
			HEADER,
			csvLine(accountA.slug, "", "2026-04-01", "deposit", "100.00", "new row"),
			csvLine(accountA.slug, "12", "2026-04-02", "withdrawal", "-5.25", "edit"),
			csvLine(accountA.slug, "13", "2026-04-03", "charge", "9.99", "gone", "1"),
		].join("\n");

		const result = parseUpdateCsv(csv);
		expect(result.errors).toEqual([]);
		expect(result.rows).toHaveLength(3);
		expect(result.rows[0].id).toBeNull();
		expect(result.rows[0].amount).toBe(100);
		expect(result.rows[1].id).toBe(12);
		expect(result.rows[2].deleteFlag).toBe(true);
	});

	it("refuses invalid types, amounts, dates and _delete values with row numbers", () => {
		const csv = [
			HEADER,
			csvLine(accountA.slug, "", "2026-04-01", "not_a_type", "1.00", "x"),
			csvLine(accountA.slug, "", "2026-04-02", "deposit", "abc", "x"),
			csvLine(accountA.slug, "", "04/2026/01", "deposit", "1.00", "x"),
			csvLine(accountA.slug, "", "2026-04-04", "deposit", "1.00", "x", "maybe"),
			csvLine("", "", "2026-04-05", "deposit", "1.00", "no slug"),
		].join("\n");

		const result = parseUpdateCsv(csv);
		expect(result.rows).toHaveLength(0);
		const messages = result.errors.join("\n");
		expect(messages).toContain("Row 1:");
		expect(messages).toContain("Row 2:");
		expect(messages).toContain("Row 3:");
		expect(messages).toContain("Row 4: _delete");
		expect(messages).toContain("Row 5: account_slug");
	});

	it("detects backup header lines and skips comments", () => {
		const csv = [
			"# backup of 2 touched rows at 2026-10-18T09:00:00.000Z",
			"# reimport in recovery mode (upsert by id) to restore these values",
			HEADER,
			csvLine(accountA.slug, "7", "2026-01-01", "deposit", "1.00", "b"),
		].join("\n");

		const result = parseUpdateCsv(csv);
		expect(result.isBackup).toBe(true);
		expect(result.backupTimestamp).toBe("2026-10-18T09:00:00.000Z");
		expect(result.errors).toEqual([]);
		expect(result.rows[0]?.id).toBe(7);
	});

	it("rejects wrong headers (parse) and duplicate ids (plan)", async () => {
		const badHeader = parseUpdateCsv(
			"date,type,amount,description\n2026-01-01,deposit,1,x",
		);
		expect(badHeader.errors[0]).toContain("Invalid header");

		const dup = await previewReimport(
			testUserId,
			[
				HEADER,
				csvLine(accountA.slug, "5", "2026-01-01", "deposit", "1.00", "a"),
				csvLine(accountA.slug, "5", "2026-01-02", "deposit", "2.00", "b"),
			].join("\n"),
			{ recovery: false },
		);
		expect(dup.ok).toBe(false);
		if (!dup.ok) {
			expect(dup.errors.join("\n")).toContain("id 5 appears again");
		}
	});
});

describe("previewReimport", () => {
	it("computes exact counts and per-row field diffs without writing", async () => {
		const editId = await insertTx(
			accountA.id,
			"deposit",
			10000,
			"2026-03-05",
			"old desc",
		);
		const sameId = await insertTx(
			accountA.id,
			"withdrawal",
			-2000,
			"2026-03-06",
			"same",
		);
		const deleteId = await insertTx(
			accountB.id,
			"charge",
			550,
			"2026-03-07",
			"doomed",
		);

		const csv = [
			HEADER,
			csvLine(
				accountA.slug,
				String(editId),
				"2026-03-05",
				"deposit",
				"100.00",
				"new desc",
			),
			csvLine(
				accountA.slug,
				String(sameId),
				"2026-03-06",
				"withdrawal",
				"-20.00",
				"same",
			),
			csvLine(
				accountB.slug,
				String(deleteId),
				"2026-03-07",
				"charge",
				"5.50",
				"doomed",
				"1",
			),
			csvLine(accountB.slug, "", "2026-04-01", "interest", "3.33", "fresh row"),
		].join("\n");

		const preview = await previewReimport(testUserId, csv, { recovery: false });
		expect(preview.ok).toBe(true);
		if (!preview.ok) return;

		expect(preview.counts).toEqual({
			inserted: 1,
			edited: 1,
			deleted: 1,
			skipped: 1,
		});

		const edit = preview.edits[0];
		expect(edit.id).toBe(editId);
		expect(edit.diffs).toEqual([
			{ field: "description", before: "old desc", after: "new desc" },
		]);

		expect(preview.deletes[0]?.id).toBe(deleteId);
		expect(preview.inserts[0]?.accountSlug).toBe(accountB.slug);

		// Nothing was written
		expect((await getTx(editId))?.description).toBe("old desc");
		expect(await getTx(deleteId)).toBeDefined();
	});

	it("refuses unknown ids, foreign rows and id/slug mismatches at file level", async () => {
		const mineId = await insertTx(
			accountA.id,
			"deposit",
			100,
			"2026-03-01",
			"mine",
		);
		const foreignId = await insertTx(
			(await insertAccount(otherUserId)).id,
			"deposit",
			100,
			"2026-03-01",
			"theirs",
		);

		// Unknown id
		const unknown = await previewReimport(
			testUserId,
			[
				HEADER,
				csvLine(
					accountA.slug,
					"999999999",
					"2026-03-01",
					"deposit",
					"1.00",
					"x",
				),
			].join("\n"),
			{ recovery: false },
		);
		expect(unknown.ok).toBe(false);
		if (!unknown.ok) {
			expect(unknown.errors.join("\n")).toContain(
				"Row 1: unknown transaction id 999999999",
			);
		}

		// Foreign id (belongs to another user — must not resolve)
		const foreign = await previewReimport(
			testUserId,
			[
				HEADER,
				csvLine(
					accountA.slug,
					String(foreignId),
					"2026-03-01",
					"deposit",
					"1.00",
					"x",
				),
			].join("\n"),
			{ recovery: false },
		);
		expect(foreign.ok).toBe(false);
		if (!foreign.ok) {
			expect(foreign.errors.join("\n")).toContain("unknown transaction id");
		}

		// Id/slug mismatch
		const mismatch = await previewReimport(
			testUserId,
			[
				HEADER,
				csvLine(
					accountB.slug,
					String(mineId),
					"2026-03-01",
					"deposit",
					"1.00",
					"x",
				),
			].join("\n"),
			{ recovery: false },
		);
		expect(mismatch.ok).toBe(false);
		if (!mismatch.ok) {
			expect(mismatch.errors.join("\n")).toContain(
				`belongs to account '${accountA.slug}'`,
			);
		}

		// Unknown slug on an insert row
		const badSlug = await previewReimport(
			testUserId,
			[
				HEADER,
				csvLine("no-such-slug", "", "2026-03-01", "deposit", "1.00", "x"),
			].join("\n"),
			{ recovery: false },
		);
		expect(badSlug.ok).toBe(false);
	});

	it("refuses unknown categories (no silent coercion)", async () => {
		const csv = [
			HEADER,
			[
				accountA.slug,
				"",
				"2026-03-01",
				"deposit",
				"1.00",
				'"x"',
				'"Ghost Category"',
				"",
			].join(","),
		].join("\n");
		const preview = await previewReimport(testUserId, csv, { recovery: false });
		expect(preview.ok).toBe(false);
		if (!preview.ok) {
			expect(preview.errors.join("\n")).toContain(
				"unknown category 'Ghost Category'",
			);
		}
	});
});

describe("commitReimport — full round-trip", () => {
	it("applies edit + delete + insert from one file atomically", async () => {
		const editId = await insertTx(
			accountA.id,
			"deposit",
			10000,
			"2026-05-01",
			"before edit",
		);
		const deleteId = await insertTx(
			accountA.id,
			"charge",
			4400,
			"2026-05-02",
			"to delete",
		);

		const result = await commitReimport(
			testUserId,
			[
				HEADER,
				csvLine(
					accountA.slug,
					String(editId),
					"2026-05-03",
					"withdrawal",
					"-88.00",
					"after edit",
				),
				csvLine(
					accountA.slug,
					String(deleteId),
					"2026-05-02",
					"charge",
					"44.00",
					"to delete",
					"1",
				),
				csvLine(
					accountB.slug,
					"",
					"2026-05-04",
					"dividend",
					"12.34",
					"brand new",
				),
			].join("\n"),
			{ recovery: false },
		);

		expect("errors" in result).toBe(false);
		if ("errors" in result) return;
		expect(result.counts).toEqual({
			inserted: 1,
			edited: 1,
			deleted: 1,
			skipped: 0,
		});

		// Edit applied (date, type, amount, description all changed)
		const edited = await getTx(editId);
		expect(edited?.description).toBe("after edit");
		expect(edited?.type).toBe("withdrawal");
		expect(edited?.amount).toBe(-8800);
		expect(edited?.transactionDate.toISOString().split("T")[0]).toBe(
			"2026-05-03",
		);

		// Delete applied
		expect(await getTx(deleteId)).toBeUndefined();

		// Insert applied with a fresh slug, no id carried from the file
		const inserted = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.accountId, accountB.id));
		const newRow = inserted.find((tx) => tx.description === "brand new");
		expect(newRow).toBeDefined();
		expect(newRow?.amount).toBe(1234);
		expect(newRow?.type).toBe("dividend");

		// Backup written with the touched rows' pre-state
		expect(result.backupFilename).not.toBeNull();
		const backup = await readBackupFile(
			testUserId,
			result.backupFilename ?? "",
		);
		expect(backup).not.toBeNull();
		const header = parseBackupHeaderLine(backup?.split("\n")[0] ?? "");
		expect(header?.scope).toBe("2 touched rows");
		expect(backup).toContain("before edit");
		expect(backup).toContain("to delete");
		expect(backup).not.toContain("after edit");
	});

	it("is atomic: one invalid row rejects the file and changes nothing", async () => {
		const keepId = await insertTx(
			accountA.id,
			"deposit",
			500,
			"2026-06-01",
			"keep me",
		);

		const before = await db
			.select({ count: accountTransactions.id })
			.from(accountTransactions)
			.where(eq(accountTransactions.accountId, accountA.id));

		const result = await commitReimport(
			testUserId,
			[
				HEADER,
				csvLine(
					accountA.slug,
					String(keepId),
					"2026-06-01",
					"deposit",
					"5.00",
					"changed!",
				),
				csvLine(
					accountA.slug,
					"",
					"2026-06-02",
					"deposit",
					"1.00",
					"ok insert",
				),
				csvLine(
					accountA.slug,
					"",
					"2026-06-03",
					"bogus_type",
					"1.00",
					"bad row",
				),
			].join("\n"),
			{ recovery: false },
		);

		expect("errors" in result).toBe(true);
		if (!("errors" in result)) return;
		expect(result.errors.join("\n")).toMatch(/Row 3/);

		// Nothing changed: same row count, same values
		const after = await db
			.select({ count: accountTransactions.id })
			.from(accountTransactions)
			.where(eq(accountTransactions.accountId, accountA.id));
		expect(after).toHaveLength(before.length);
		expect((await getTx(keepId))?.description).toBe("keep me");

		const stray = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.accountId, accountA.id));
		expect(stray.some((tx) => tx.description === "ok insert")).toBe(false);
	});

	it("export → edit+delete+insert → reimport round-trip from a real export", async () => {
		const e1 = await insertTx(
			accountA.id,
			"deposit",
			20000,
			"2026-07-01",
			"rt-edit",
		);
		const e2 = await insertTx(
			accountA.id,
			"withdrawal",
			-3000,
			"2026-07-02",
			"rt-delete",
		);
		await insertTx(accountA.id, "interest", 150, "2026-07-03", "rt-keep");

		const { csv } = await buildTransactionsCsv(testUserId, {
			accountSlugs: [accountA.slug],
			from: "2026-07-01",
			to: "2026-07-31",
			type: null,
		});

		// Rewrite the file: edit rt-edit's description, mark rt-delete, append a new row.
		// Export rows always end with an empty `_delete` field, so flipping the
		// delete flag appends "1" to the trailing empty cell.
		const lines = csv.trim().split("\n");
		const edited = lines
			.map((line) =>
				line.includes("rt-edit") ? line.replace("rt-edit", "rt-edited") : line,
			)
			.map((line) =>
				line.includes("rt-delete") && line.endsWith(",") ? `${line}1` : line,
			);
		edited.push(
			csvLine(accountA.slug, "", "2026-07-05", "refund", "-1.10", "rt-new"),
		);
		const reimportFile = edited.join("\n");

		const result = await commitReimport(testUserId, reimportFile, {
			recovery: false,
		});
		expect("errors" in result).toBe(false);
		if ("errors" in result) return;
		expect(result.counts).toEqual({
			inserted: 1,
			edited: 1,
			deleted: 1,
			skipped: 1,
		});

		expect((await getTx(e1))?.description).toBe("rt-edited");
		expect(await getTx(e2)).toBeUndefined();
		const rows = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.accountId, accountA.id));
		expect(
			rows.some((tx) => tx.description === "rt-new" && tx.amount === -110),
		).toBe(true);
	});
});

describe("commitReimport — recovery mode", () => {
	it("restores a deletion: backup reimport reinserts with original id and values", async () => {
		const id = await insertTx(
			accountA.id,
			"deposit",
			7777,
			"2026-08-01",
			"restore me",
		);
		const slugBefore = (await getTx(id))?.slug;

		// Delete it via a reimport and capture the backup
		const deleted = await commitReimport(
			testUserId,
			[
				HEADER,
				csvLine(
					accountA.slug,
					String(id),
					"2026-08-01",
					"deposit",
					"77.77",
					"restore me",
					"1",
				),
			].join("\n"),
			{ recovery: false },
		);
		expect("errors" in deleted).toBe(false);
		if ("errors" in deleted) return;
		expect(deleted.counts.deleted).toBe(1);
		expect(await getTx(id)).toBeUndefined();

		// The same file in normal mode is refused (typo protection)
		if (!deleted.backupFilename) throw new Error("expected a backup file");
		const backupText =
			(await readBackupFile(testUserId, deleted.backupFilename)) ?? "";
		const refused = await commitReimport(testUserId, backupText, {
			recovery: false,
		});
		expect("errors" in refused).toBe(true);

		// Recovery mode reinserts with the original id and values
		const restored = await commitReimport(testUserId, backupText, {
			recovery: true,
		});
		expect("errors" in restored).toBe(false);
		if ("errors" in restored) return;
		expect(restored.counts.inserted).toBe(1);

		const row = await getTx(id);
		expect(row).toBeDefined();
		expect(row?.amount).toBe(7777);
		expect(row?.description).toBe("restore me");
		// Fresh slug, original id
		expect(row?.slug).not.toBe(slugBefore);

		// Re-running the same restore is idempotent-ish: now a skip
		const again = await commitReimport(testUserId, backupText, {
			recovery: true,
		});
		expect("errors" in again).toBe(false);
		if (!("errors" in again)) {
			expect(again.counts.skipped).toBe(1);
			expect(again.backupFilename).toBeNull();
		}
	});

	it("restores edited values via upsert", async () => {
		const id = await insertTx(
			accountA.id,
			"deposit",
			1000,
			"2026-09-01",
			"pristine",
		);

		// Edit it away from pristine, capturing the pre-state backup
		const edited = await commitReimport(
			testUserId,
			[
				HEADER,
				csvLine(
					accountA.slug,
					String(id),
					"2026-09-02",
					"charge",
					"-99.99",
					"mangled",
				),
			].join("\n"),
			{ recovery: false },
		);
		expect("errors" in edited).toBe(false);
		expect((await getTx(id))?.description).toBe("mangled");

		// Restore from backup: values return to pristine
		if ("errors" in edited || !edited.backupFilename)
			throw new Error("edit commit failed");
		const backupText =
			(await readBackupFile(testUserId, edited.backupFilename)) ?? "";
		const restored = await commitReimport(testUserId, backupText, {
			recovery: true,
		});
		expect("errors" in restored).toBe(false);
		const row = await getTx(id);
		expect(row?.description).toBe("pristine");
		expect(row?.amount).toBe(1000);
		expect(row?.type).toBe("deposit");
		expect(row?.transactionDate.toISOString().split("T")[0]).toBe("2026-09-01");
	});
});

describe("backup file isolation", () => {
	it("never serves another user's backups", async () => {
		const id = await insertTx(accountA.id, "deposit", 100, "2026-10-01", "iso");
		const result = await commitReimport(
			testUserId,
			[
				HEADER,
				csvLine(
					accountA.slug,
					String(id),
					"2026-10-01",
					"deposit",
					"1.00",
					"iso",
					"1",
				),
			].join("\n"),
			{ recovery: false },
		);
		expect("errors" in result).toBe(false);
		if ("errors" in result) return;

		// Same filename read as the other user resolves to nothing
		const foreign = await readBackupFile(
			otherUserId,
			result.backupFilename ?? "",
		);
		expect(foreign).toBeNull();

		// Pattern-validated: traversal-style names are refused
		expect(await readBackupFile(testUserId, "../../etc/passwd")).toBeNull();
		expect(await readBackupFile(testUserId, "backup-123-nope")).toBeNull();

		// Restore our row for cleanliness
		const cleanupBackup = await readBackupFile(
			testUserId,
			result.backupFilename ?? "",
		);
		if (cleanupBackup) {
			await commitReimport(testUserId, cleanupBackup, { recovery: true });
		}
	});
});
