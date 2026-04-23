import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { accounts, accountTransactions, users } from "$lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
	getOverlappingTransactions,
	batchInsertTransactions,
	type ImportRow,
} from "./imports";

let testUserId: number;
let testAccountId: number;
let cleanupAccountIds: number[] = [];

// Setup: create a temporary test account
beforeAll(async () => {
	const [user] = await db
		.insert(users)
		.values({
			username: `imports-user-${Date.now()}-${nanoid(6)}`,
			passwordHash: "hash",
			totpSecret: "secret",
			totpSecretIV: "iv",
			passwordSalt: "salt",
		})
		.returning({ id: users.id });
	testUserId = user.id;

	const [account] = await db
		.insert(accounts)
		.values({
			slug: nanoid(16),
			userId: testUserId,
			name: "CSV Import Test Account",
			type: "current",
			taxWrapper: "none",
			category: "asset",
			closedAt: null,
			excludedFromNetWorth: false,
		})
		.returning();
	testAccountId = account.id;
	cleanupAccountIds.push(account.id);
});

// Cleanup: delete test data
afterAll(async () => {
	// Delete transactions first (FK constraint)
	for (const id of cleanupAccountIds) {
		await db.delete(accountTransactions).where(eq(accountTransactions.accountId, id));
		await db.delete(accounts).where(eq(accounts.id, id));
	}
	await db.delete(users).where(eq(users.id, testUserId));
});

describe("getOverlappingTransactions", () => {
	it("should return empty array when no transactions exist", async () => {
		const result = await getOverlappingTransactions(
			testUserId,
			testAccountId,
			"2026-01-01",
			"2026-01-31",
		);

		expect(result).toEqual([]);
	});

	it("should return transactions within the date range", async () => {
		// Insert test transactions
		await db.insert(accountTransactions).values([
			{
				slug: nanoid(21),
				accountId: testAccountId,
				type: "deposit",
				amount: 10000, // £100.00 in cents
				description: "Test deposit",
				categoryId: null,
				transactionDate: new Date("2026-01-15T00:00:00.000Z"),
			},
			{
				slug: nanoid(21),
				accountId: testAccountId,
				type: "withdrawal",
				amount: -5000, // -£50.00 in cents
				description: "Test withdrawal",
				categoryId: null,
				transactionDate: new Date("2026-01-20T00:00:00.000Z"),
			},
		]);

		const result = await getOverlappingTransactions(
			testUserId,
			testAccountId,
			"2026-01-01",
			"2026-01-31",
		);

		expect(result).toHaveLength(2);
		expect(result[0].description).toBe("Test deposit");
		expect(result[0].transactionDate).toBe("2026-01-15");
		expect(result[1].transactionDate).toBe("2026-01-20");
	});
});

describe("batchInsertTransactions", () => {
	it("should insert multiple rows and return count", async () => {
		const rows: ImportRow[] = [
			{
				date: "2026-02-01",
				type: "deposit",
				amount: 1000.0,
				description: "Batch import test 1",
			},
			{
				date: "2026-02-02",
				type: "withdrawal",
				amount: -50.0,
				description: "Batch import test 2",
			},
		];

		const count = await batchInsertTransactions(
			testUserId,
			testAccountId,
			rows,
		);

		expect(count).toBe(2);

		// Verify the transactions were actually inserted
		const inserted = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.accountId, testAccountId));

		const imported = inserted.filter(
			(tx) => tx.description?.startsWith("Batch import test"),
		);

		expect(imported).toHaveLength(2);
		// Amount should be converted to cents
		expect(imported[0].amount).toBe(100000); // £1000.00 -> 100000 cents
		expect(imported[1].amount).toBe(-5000); // -£50.00 -> -5000 cents
	});
});
