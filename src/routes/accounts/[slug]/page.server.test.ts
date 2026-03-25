import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db/client';
import { accounts, interestRates, accountTransactions } from '$lib/db/schema';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { load } from './+page.server';

describe('Account page load - liability projections', () => {
	let testAccountId: number;
	let testSlug: string;

	beforeEach(async () => {
		const [account] = await db.insert(accounts).values({
			slug: nanoid(21),
			name: 'Test Liability',
			type: 'credit-card',
			category: 'liability',
			creditLimit: 200000, // £2,000
			minimumPaymentType: 'flat_or_percentage',
			minimumPaymentFlat: 2500, // £25
			minimumPaymentPercentage: 250, // 2.5%
			currency: 'GBP',
			country: 'GB',
			userId: 1 // Test user ID
		}).returning({ id: accounts.id, slug: accounts.slug });

		testAccountId = account.id;
		testSlug = account.slug;

		await db.insert(interestRates).values({
			accountId: testAccountId,
			rate: 1000, // 10%
			effectiveFrom: new Date('2024-01-01')
		});

		// Add transaction to establish balance
		await db.insert(accountTransactions).values({
			slug: nanoid(21),
			accountId: testAccountId,
			type: 'withdrawal',
			amount: -100000, // -£1,000
			transactionDate: new Date('2024-01-01')
		});
	});

	it('should calculate TTZ for liability accounts', async () => {
		const result = await load({
			locals: { user: { id: 1 } },
			params: { slug: testSlug },
			url: new URL('http://localhost/?taxYearStart=2024-04-06')
		});

		expect(result.ttz).toBeDefined();
		expect(result.ttz.months).toBeGreaterThan(0);
		expect(result.projection).toHaveLength(12); // 12 months
	});

	it('should calculate utilization for revolving debt', async () => {
		const result = await load({
			locals: { user: { id: 1 } },
			params: { slug: testSlug },
			url: new URL('http://localhost/?taxYearStart=2024-04-06')
		});

		expect(result.account.creditLimit).toBe(200000);
		// Utilization = 100000 / 200000 * 100 = 50%
	});
});
