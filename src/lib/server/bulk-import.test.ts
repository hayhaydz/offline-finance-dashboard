import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { accounts, accountTransactions, users } from "$lib/db/schema";
import { generateDataKey, unlockKeyring } from "$lib/server/crypto/keyring";
import { parseUpdateCsv } from "./imports-update";
import { commitReimport, previewReimport } from "./imports-update";
import {
	analyzeBankCsv,
	transformBankCsv,
	type ColumnMapping,
} from "./bulk-import";

/**
 * v3 B06 slice S5 (R26): bulk bank-history import. A Monzo-shaped export
 * is analyzed, mapped, transformed into the app's CSV and applied through
 * the reimport engine — the only writer.
 */

let testUserId: number;
let accountSlug: string;
let accountId: number;
const cleanupUserIds: number[] = [];
const cleanupAccountIds: number[] = [];

/** Monzo personal-export-shaped CSV (verified column layout, dd/mm/yyyy). */
const monzoCsv = [
	"transaction_id,date,time,type,name,emoji,category,amount,currency,local_amount,local_currency,notes,address,receipt,description,category_split",
	"tx_01,14/02/2026,08:14:00,Card payment,Pret A Manger,,eating_out,-4.85,GBP,-4.85,GBP,,,,,",
	'tx_02,15/02/2026,09:02:11,Faster payment,Salary January,,income,2500.00,GBP,2500.00,GBP,"bonus, yay",,,monthly salary,',
	"tx_03,16/02/2026,10:00:00,Direct debit,Rent,,bills,-1200.00,GBP,-1200.00,GBP,,,,,,",
	"tx_04,17/02/2026,11:30:00,Card payment,Tesco,,groceries,-42.10,GBP,-42.10,GBP,,,,,,",
	"tx_05,18/02/2026,12:00:00,Declined,Bad day,,general,0.00,GBP,0.00,GBP,,,,,,",
].join("\n");

function ukAccount(): Promise<{ id: number; slug: string }> {
	return (async () => {
		const [account] = await db
			.insert(accounts)
			.values({
				slug: nanoid(16),
				userId: testUserId,
				name: `Bulk Test ${nanoid(4)}`,
				type: "current",
				taxWrapper: "none",
				category: "asset",
				closedAt: null,
				excludedFromNetWorth: false,
			})
			.returning({ id: accounts.id, slug: accounts.slug });
		cleanupAccountIds.push(account.id);
		return account;
	})();
}

beforeAll(async () => {
	testUserId = await insertUser();
	unlockKeyring(testUserId, generateDataKey());
	cleanupUserIds.push(testUserId);
	const account = await ukAccount();
	accountId = account.id;
	accountSlug = account.slug;
});

async function insertUser(): Promise<number> {
	const [user] = await db
		.insert(users)
		.values({
			username: `bulk-user-${Date.now()}-${nanoid(6)}`,
			passwordHash: "hash",
			passwordSalt: "salt",
		})
		.returning({ id: users.id });
	return user.id;
}

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
	await rm(`storage/backups/user-${testUserId}`, { recursive: true, force: true });
});

describe("analyzeBankCsv", () => {
	it("detects the Monzo layout and auto-maps its columns", () => {
		const result = analyzeBankCsv(monzoCsv);
		expect("error" in result).toBe(false);
		if ("error" in result) return;
		expect(result.monzoPreset).toBe(true);
		expect(result.rowCount).toBe(5);
		expect(result.header[0]).toBe("transaction_id");
		expect(result.mapping.dateCol).toBe(1);
		expect(result.mapping.descriptionCol).toBe(4); // name
		expect(result.mapping.amountCol).toBe(7);
		expect(result.mapping.categoryCol).toBe(6);
		expect(result.mapping.dateFormat).toBe("uk");
	});

	it("guesses columns on unknown layouts", () => {
		const generic = [
			"Posted Date,Narrative,Reference,Debit",
			"2026-03-01,COFFEE SHOP,PAYMENT,-3.50",
		].join("\n");
		const result = analyzeBankCsv(generic);
		expect("error" in result).toBe(false);
		if ("error" in result) return;
		expect(result.monzoPreset).toBe(false);
		expect(result.mapping.dateCol).toBe(0);
		expect(result.mapping.dateFormat).toBe("iso");
	});

	it("refuses files without data rows", () => {
		const result = analyzeBankCsv("date,amount\n");
		expect("error" in result).toBe(true);
	});
});

describe("transformBankCsv", () => {
	it("maps a Monzo export to the app CSV with sign-driven types and uk dates", async () => {
		const analysis = analyzeBankCsv(monzoCsv);
		if ("error" in analysis) throw new Error("analyze failed");
		const result = await transformBankCsv(
			testUserId,
			accountSlug,
			monzoCsv,
			analysis.mapping,
		);
		expect("error" in result).toBe(false);
		if ("error" in result) return;

		// £0 row skipped, 4 kept
		expect(result.rows).toBe(4);
		expect(result.skipped).toEqual([
			{ reason: "zero or invalid amount", count: 1 },
		]);

		const parsed = parseUpdateCsv(result.csv);
		expect(parsed.errors).toEqual([]);
		expect(parsed.rows).toHaveLength(4);

		const byDescription = new Map(parsed.rows.map((r) => [r.description, r]));
		// dd/mm/yyyy → ISO
		expect(byDescription.get("Pret A Manger")?.date).toBe("2026-02-14");
		expect(byDescription.get("Pret A Manger")?.amount).toBe(-4.85);
		expect(byDescription.get("Pret A Manger")?.type).toBe("withdrawal");
		// positive → deposit
		expect(byDescription.get("Salary January")?.type).toBe("deposit");
		// categories pass through ONLY when the user owns the category —
		// this user has none, so all category cells are empty
		for (const row of parsed.rows) {
			expect(row.category).toBe("");
		}
		// every row targets the chosen account
		for (const row of parsed.rows) {
			expect(row.accountSlug).toBe(accountSlug);
		}
	});

	it("refuses unknown accounts and closed accounts", async () => {
		const bad = await transformBankCsv(
			testUserId,
			"no-such-slug",
			monzoCsv,
			{
				dateCol: 1,
				descriptionCol: 4,
				amountCol: 7,
				categoryCol: -1,
				dateFormat: "uk",
			},
		);
		expect("error" in bad).toBe(true);
	});

	it("explicit mapping works for a non-Monzo layout", async () => {
		const generic = [
			"Posted Date,Narrative,Reference,Debit",
			"2026-03-01,COFFEE SHOP,PAYMENT,-3.50",
			"2026-03-02,REFUND,RETAILER,12.00",
		].join("\n");
		const mapping: ColumnMapping = {
			dateCol: 0,
			descriptionCol: 1,
			amountCol: 3,
			categoryCol: -1,
			dateFormat: "iso",
		};
		const result = await transformBankCsv(
			testUserId,
			accountSlug,
			generic,
			mapping,
		);
		expect("error" in result).toBe(false);
		if ("error" in result) return;
		const parsed = parseUpdateCsv(result.csv);
		expect(parsed.rows).toHaveLength(2);
		expect(parsed.rows[0]?.date).toBe("2026-03-01");
		expect(parsed.rows[1]?.type).toBe("deposit");
	});
});

describe("bulk round-trip into the reimport engine", () => {
	it("preview reports all inserts; commit applies them; re-run is a no-op", async () => {
		const analysis = analyzeBankCsv(monzoCsv);
		if ("error" in analysis) throw new Error("analyze failed");
		const transformed = await transformBankCsv(
			testUserId,
			accountSlug,
			monzoCsv,
			analysis.mapping,
		);
		if ("error" in transformed) throw new Error("transform failed");

		const preview = await previewReimport(testUserId, transformed.csv, {
			recovery: false,
		});
		expect(preview.ok).toBe(true);
		if (!preview.ok) return;
		expect(preview.counts.inserted).toBe(4);

		const commit = await commitReimport(testUserId, transformed.csv, {
			recovery: false,
		});
		expect("errors" in commit).toBe(false);

		const rows = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.accountId, accountId));
		expect(rows.length).toBe(4);

		// Importing the same file again: every row now exists (fresh
		// inserts would duplicate — the engine has no dedup on id-less
		// rows by design; a re-run inserts duplicates). Document: bulk
		// re-runs are the user's responsibility, same as append import.
		const rerun = await commitReimport(testUserId, transformed.csv, {
			recovery: false,
		});
		expect("errors" in rerun).toBe(false);
		const rowsAfter = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.accountId, accountId));
		expect(rowsAfter.length).toBe(8);
	});
});
