import { describe, it, expect, vi, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.hoisted(() => {
	process.env.APP_ENV = 'test';
});

import { createDb } from '$lib/db/client';
import { runMigrations } from '$lib/db/migrate';
import { sql } from 'drizzle-orm';
import { users, accounts, accountBalances } from '$lib/db/schema';

describe('Database Integration & Migrations', () => {
	const createdFiles: string[] = [];

	afterAll(() => {
		for (const file of createdFiles) {
			try {
				if (fs.existsSync(file)) {
					fs.unlinkSync(file);
				}
			} catch (e) {
				// ignore
			}
		}
	});

	async function setupTestDb() {
		const dbFile = path.resolve(`storage/test-${Math.random().toString(36).substring(7)}.db`);
		createdFiles.push(dbFile);
		const testDb = createDb(dbFile);
		await runMigrations(testDb);
		return { testDb, dbFile };
	}

	it('should successfully run migrations on a new database', async () => {
		const { testDb } = await setupTestDb();

		// Verify tables exist using raw sqlite_master query
		const result = await testDb.values(
			sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
		);
		
		const tableNames = result.map(row => row[0] as string);
		
		const expectedTables = [
			'users',
			'sessions',
			'backup_codes',
			'login_attempts',
			'accounts',
			'account_balances',
			'system_metadata',
			'__drizzle_migrations'
		];

		for (const table of expectedTables) {
			expect(tableNames).toContain(table);
		}
	});

	it('should have correct system_metadata initialized', async () => {
		const { testDb } = await setupTestDb();
		const metadata = await testDb.values(sql`SELECT * FROM system_metadata`);
		
		const keys = metadata.map(m => m[0]);
		expect(keys).toContain('encryption_status');
		expect(keys).toContain('created_in_env');
		
		const envRow = metadata.find(m => m[0] === 'created_in_env');
		expect(envRow?.[1]).toBe('test');
	});

	it('should support basic CRUD operations using ORM', async () => {
		const { testDb } = await setupTestDb();

		// 1. Test Users
		const [newUser] = await testDb.insert(users).values({
			username: 'testuser_' + Date.now(),
			passwordHash: 'hash',
			totpSecret: 'secret',
			totpSecretIV: 'iv',
			passwordSalt: 'salt',
		}).returning();
		
		expect(newUser.id).toBeDefined();

		// 2. Test Accounts
		const [newAccount] = await testDb.insert(accounts).values({
			userId: newUser.id,
			slug: 'test-account-slug-' + Date.now(),
			name: 'Test Account',
			type: 'current',
			taxWrapper: 'none',
			category: 'asset',
		}).returning();
		
		expect(newAccount.id).toBeDefined();

		// 3. Test Balances
		const [newBalance] = await testDb.insert(accountBalances).values({
			accountId: newAccount.id,
			slug: 'test-balance-slug-' + Date.now(),
			balanceInCents: 10000,
			asOfDate: new Date(),
		}).returning();
		
		expect(newBalance.id).toBeDefined();

		// 4. Verify relations/data
		const userCount = await testDb.select({ count: sql<number>`count(*)` }).from(users);
		expect(userCount[0].count).toBe(1);
	});
});