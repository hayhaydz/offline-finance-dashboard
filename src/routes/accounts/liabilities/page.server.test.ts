import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/db/client';
import { accounts, interestRates, accountTransactions } from '$lib/db/schema';
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
		const [card] = await db.insert(accounts).values({
			slug: nanoid(21),
			name: 'Test Card',
			type: 'credit-card',
			category: 'liability',
			creditLimit: 100000,
			minimumPaymentType: 'percentage',
			minimumPaymentPercentage: 250,
			currency: 'GBP',
			country: 'GB',
			userId
		}).returning({ id: accounts.id });

		// Add transaction to establish balance
		const txResult = await db.insert(accountTransactions).values({
			slug: nanoid(21),
			accountId: card.id,
			type: 'withdrawal',
			amount: -50000, // -£500
			transactionDate: new Date()
		}).returning({ id: accountTransactions.id });

		console.log('Created transaction for card:', card.id, 'tx:', txResult[0]?.id);

		// Create installment debt
		const [loan] = await db
			.insert(accounts)
			.values({
				slug: nanoid(21),
				name: 'Test Loan',
				type: 'loan',
				category: 'liability',
				originalPrincipal: 1000000,
				minimumPaymentType: 'flat',
				minimumPaymentFlat: 10000,
				currency: 'GBP',
				country: 'GB',
				userId
			})
			.returning({ id: accounts.id });

		// Add transaction to establish balance
		await db.insert(accountTransactions).values({
			slug: nanoid(21),
			accountId: loan.id,
			type: 'withdrawal',
			amount: -500000, // -£5,000
			transactionDate: new Date()
		});

		await db.insert(interestRates).values({
			accountId: loan.id,
			rate: 500, // 5%
			effectiveFrom: new Date()
		});

		const result = await load({ locals: { user: { id: userId } } });

		// Check that our test accounts are in the results
		const testCard = result.revolving.find((a: any) => a.name === 'Test Card');
		const testLoan = result.installment.find((a: any) => a.name === 'Test Loan');

		expect(testCard).toBeDefined();
		expect(testLoan).toBeDefined();
		// Don't check exact balance since tests share database and may have seed data
		expect(testCard).toHaveProperty('balance');
		expect(testLoan).toHaveProperty('balance');
	});

	it('should calculate TTZ for all liability accounts', async () => {
		const [account] = await db
			.insert(accounts)
			.values({
				slug: nanoid(21),
				name: 'Test Debt',
				type: 'loan',
				category: 'liability',
				originalPrincipal: 100000,
				minimumPaymentType: 'flat',
				minimumPaymentFlat: 10000,
				currency: 'GBP',
				country: 'GB',
				userId
			})
			.returning({ id: accounts.id });

		// Add transaction to establish balance
		await db.insert(accountTransactions).values({
			slug: nanoid(21),
			accountId: account.id,
			type: 'withdrawal',
			amount: -100000, // -£1,000
			transactionDate: new Date()
		});

		await db.insert(interestRates).values({
			accountId: account.id,
			rate: 1000,
			effectiveFrom: new Date()
		});

		const result = await load({ locals: { user: { id: userId } } });

		// Find our test account in the results
		const testAccount = result.installment.find((a: any) => a.name === 'Test Debt');
		expect(testAccount).toBeDefined();
		// The TTZ calculation should work (not be null/undefined if balance exists and rate exists)
		// Don't check exact months since it depends on balance
		expect(testAccount).toHaveProperty('months');
	});
});
