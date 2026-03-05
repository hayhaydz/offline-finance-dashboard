import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/db/client';
import { users, accounts, interestRates, accountTransactions } from '$lib/db/schema';
import {
	getActualInterestEarned,
	getTaxFreeStatus
} from '$lib/server/calculations';

describe('Interest Summaries', () => {
	let testUserId: number;
	let testAccountId: number;

	beforeAll(async () => {
		// Create test user with basic tax band
		const [user] = await db.insert(users).values({
			username: 'interest-test-user',
			passwordHash: 'hash',
			totpSecret: 'secret',
			totpSecretIV: 'iv',
			passwordSalt: 'salt',
			taxBand: 'basic',
			createdAt: new Date(),
			updatedAt: new Date(),
		}).returning();
		testUserId = user.id;

		// Create test savings account
		const [account] = await db.insert(accounts).values({
			userId: testUserId,
			slug: 'test-savings-interest',
			name: 'Test Savings',
			type: 'savings',
			category: 'asset',
			taxWrapper: 'none',
			createdAt: new Date(),
			updatedAt: new Date(),
		}).returning();
		testAccountId = account.id;

		// Add interest rate: 4.5% (450 basis points)
		await db.insert(interestRates).values({
			accountId: testAccountId,
			rate: 450,
			effectiveFrom: new Date('2025-01-01'),
			createdAt: new Date(),
		});

		// Add interest transaction
		await db.insert(accountTransactions).values({
			accountId: testAccountId,
			slug: 'interest-1',
			type: 'interest',
			amount: 45000, // £450.00
			transactionDate: new Date('2025-04-10'), // Within tax year
			createdAt: new Date(),
		});
	});

	afterAll(async () => {
		await db.delete(accountTransactions).where(eq(accountTransactions.accountId, testAccountId));
		await db.delete(interestRates).where(eq(interestRates.accountId, testAccountId));
		await db.delete(accounts).where(eq(accounts.id, testAccountId));
		await db.delete(users).where(eq(users.id, testUserId));
	});

	it('calculates actual interest earned for tax year', async () => {
		const taxYear = {
			start: new Date('2025-04-06T00:00:00.000Z'),
			end: new Date('2026-04-05T23:59:59.999Z')
		};

		const actual = await getActualInterestEarned(testUserId, taxYear.start, taxYear.end);

		expect(actual).toBe(45000); // £450.00
	});

	it('calculates tax-free status for basic rate', () => {
		const actual = 45000; // £450
		const taxBand = 'basic' as const;

		const status = getTaxFreeStatus(actual, taxBand);

		expect(status.allowance).toBe(100000); // £1,000
		expect(status.used).toBe(45000); // £450
		expect(status.remaining).toBe(55000); // £550
		expect(status.overAllowance).toBe(false);
	});

	it('calculates tax-free status for higher rate', () => {
		const actual = 75000; // £750
		const taxBand = 'higher' as const;

		const status = getTaxFreeStatus(actual, taxBand);

		expect(status.allowance).toBe(50000); // £500
		expect(status.remaining).toBe(0);
		expect(status.overAllowance).toBe(true);
		expect(status.taxableAmount).toBe(25000); // £250 over
	});

	it('calculates tax-free status for additional rate', () => {
		const actual = 10000; // £100
		const taxBand = 'additional' as const;

		const status = getTaxFreeStatus(actual, taxBand);

		expect(status.allowance).toBe(0);
		expect(status.remaining).toBe(0);
		expect(status.overAllowance).toBe(true);
		expect(status.taxableAmount).toBe(10000); // All taxable
	});
});
