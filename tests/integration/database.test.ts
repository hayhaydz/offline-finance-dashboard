import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	process.env.APP_ENV = "test";
});

import { sql } from "drizzle-orm";
import { createDb } from "$lib/db/client";
import { runMigrations } from "$lib/db/migrate";
import { accounts, accountTransactions, users } from "$lib/db/schema";

describe("Database Integration & Migrations", () => {
	const createdFiles: string[] = [];

	afterAll(() => {
		for (const file of createdFiles) {
			try {
				if (fs.existsSync(file)) {
					fs.unlinkSync(file);
				}
			} catch (_e) {
				// ignore
			}
		}
	});

	async function setupTestDb() {
		const dbFile = path.resolve(
			`storage/test-${Math.random().toString(36).substring(7)}.db`,
		);
		createdFiles.push(dbFile);
		const testDb = createDb(dbFile);
		await runMigrations(testDb);
		return { testDb, dbFile };
	}

	it("should successfully run migrations on a new database", async () => {
		const { testDb } = await setupTestDb();

		// Verify tables exist using raw sqlite_master query
		const result = await testDb.values(
			sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
		);

		const tableNames = result.map((row) => row[0] as string);

		const expectedTables = [
			"users",
			"sessions",
			"backup_codes",
			"login_attempts",
			"accounts",
			"account_transactions",
			"interest_rates",
			"goals",
			"goal_allocations",
			"snapshots",
			"system_metadata",
			"__drizzle_migrations",
		];

		for (const table of expectedTables) {
			expect(tableNames).toContain(table);
		}
	});

	it("should have correct system_metadata initialized", async () => {
		const { testDb } = await setupTestDb();
		const metadata = await testDb.values(sql`SELECT * FROM system_metadata`);

		const keys = metadata.map((m) => m[0]);
		expect(keys).toContain("encryption_status");
		expect(keys).toContain("created_in_env");

		const envRow = metadata.find((m) => m[0] === "created_in_env");
		expect(envRow?.[1]).toBe("test");
	});

	it("should create query performance indexes from migrations", async () => {
		const { testDb } = await setupTestDb();

		const result = await testDb.values(
			sql`SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'`,
		);

		const indexNames = result.map((row) => row[0] as string);

		const expectedIndexes = [
			"idx_sessions_user_last_activity",
			"idx_accounts_user_closed",
			"idx_accounts_user_excluded_closed",
			"idx_account_transactions_account_date",
			"idx_account_transactions_type",
			"idx_goals_user_deleted_sort",
			"idx_goal_allocations_goal",
			"idx_goal_allocations_account",
			"idx_interest_rates_account_effective",
		];

		for (const idx of expectedIndexes) {
			expect(indexNames).toContain(idx);
		}
	});

	it("should record one migration row per journal entry", async () => {
		const { testDb } = await setupTestDb();
		const journalPath = path.resolve("src/lib/db/migrations/meta/_journal.json");
		const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
			entries: Array<{ tag: string }>;
		};

		const migrationRowResult = await testDb.values(
			sql`SELECT COUNT(*) as count FROM __drizzle_migrations`,
		);
		const migrationRows = Number(migrationRowResult[0]?.[0] ?? 0);

		expect(migrationRows).toBe(journal.entries.length);
		expect(migrationRows).toBeGreaterThan(0);
	});

	it("should support basic CRUD operations using ORM", async () => {
		const { testDb } = await setupTestDb();

		// 1. Test Users
		const [newUser] = await testDb
			.insert(users)
			.values({
				username: `testuser_${Date.now()}`,
				passwordHash: "hash",
				totpSecret: "secret",
				totpSecretIV: "iv",
				passwordSalt: "salt",
			})
			.returning();

		expect(newUser.id).toBeDefined();

		// 2. Test Accounts
		const [newAccount] = await testDb
			.insert(accounts)
			.values({
				userId: newUser.id,
				slug: `test-account-slug-${Date.now()}`,
				name: "Test Account",
				type: "current",
				taxWrapper: "none",
				category: "asset",
			})
			.returning();

		expect(newAccount.id).toBeDefined();

		// 3. Test Transactions
		const [newTx] = await testDb
			.insert(accountTransactions)
			.values({
				accountId: newAccount.id,
				slug: `test-tx-slug-${Date.now()}`,
				type: "deposit",
				amount: 10000,
				transactionDate: new Date(),
			})
			.returning();

		expect(newTx.id).toBeDefined();

		// 4. Verify relations/data
		const userCount = await testDb
			.select({ count: sql<number>`count(*)` })
			.from(users);
		expect(userCount[0].count).toBe(1);
	});
});
