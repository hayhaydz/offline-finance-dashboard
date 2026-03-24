import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db/client';
import { accounts, interestRates } from '$lib/db/schema';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { load } from './+page.server';

describe('Liabilities dashboard load', () => {
	let userId: number;

	beforeEach(async () => {
		userId = 1;
	});

	it('should group debts into revolving and installment sections', async () => {
		// Create revolving debt
		await db.insert(accounts).values({
			slug: nanoid(21),
			name: 'Test Card',
			type: 'credit-card',
			category: 'liability',
			balance: 50000,
			creditLimit: 100000,
			minimumPaymentType: 'percentage',
			minimumPaymentPercentage: 250,
			currency: 'GBP',
			country: 'GB',
			userId
		});

		// Create installment debt
		const [loan] = await db
			.insert(accounts)
			.values({
				slug: nanoid(21),
				name: 'Test Loan',
				type: 'loan',
				category: 'liability',
				balance: 500000,
				originalPrincipal: 1000000,
				minimumPaymentType: 'flat',
				minimumPaymentFlat: 10000,
				currency: 'GBP',
				country: 'GB',
				userId
			})
			.returning({ id: accounts.id });

		await db.insert(interestRates).values({
			accountId: loan.id,
			rate: 500, // 5%
			effectiveFrom: new Date()
		});

		const result = await load({ locals: { user: { id: userId } } });

		expect(result.revolving).toHaveLength(1);
		expect(result.installment).toHaveLength(1);
		expect(result.summary.count).toBe(2);
	});

	it('should calculate TTZ for all liability accounts', async () => {
		const [account] = await db
			.insert(accounts)
			.values({
				slug: nanoid(21),
				name: 'Test Debt',
				type: 'loan',
				category: 'liability',
				balance: 100000,
				originalPrincipal: 100000,
				minimumPaymentType: 'flat',
				minimumPaymentFlat: 10000,
				currency: 'GBP',
				country: 'GB',
				userId
			})
			.returning({ id: accounts.id });

		await db.insert(interestRates).values({
			accountId: account.id,
			rate: 1000,
			effectiveFrom: new Date()
		});

		const result = await load({ locals: { user: { id: userId } } });

		expect(result.installment[0].months).toBeGreaterThan(0);
	});
});
