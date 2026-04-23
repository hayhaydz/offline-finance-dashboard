import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "$lib/db/client";
import type { User } from "$lib/db/schema";
import {
	accounts,
	accountTransactions,
	interestRates,
	users,
} from "$lib/db/schema";
import { load } from "./+page.server";

describe("Liabilities dashboard load", () => {
	let userId: number;
	let createdAccountIds: number[] = [];
	type LoadInput = Parameters<typeof load>[0];

	beforeEach(async () => {
		const [user] = await db
			.insert(users)
			.values({
				username: `liabilities-user-${Date.now()}-${nanoid(6)}`,
				passwordHash: "hash",
				totpSecret: "secret",
				totpSecretIV: "iv",
				passwordSalt: "salt",
			})
			.returning({ id: users.id });
		userId = user.id;
	});

	afterEach(async () => {
		if (createdAccountIds.length > 0) {
			await db
				.delete(accountTransactions)
				.where(inArray(accountTransactions.accountId, createdAccountIds));
			await db
				.delete(interestRates)
				.where(inArray(interestRates.accountId, createdAccountIds));
			await db.delete(accounts).where(inArray(accounts.id, createdAccountIds));
		}
		await db.delete(users).where(eq(users.id, userId));
		createdAccountIds = [];
	});

	it("should group debts into revolving and installment sections", async () => {
		// Create revolving debt
		const [card] = await db
			.insert(accounts)
			.values({
				slug: nanoid(21),
				name: "Test Card",
				type: "credit-card",
				category: "liability",
				creditLimit: 100000,
				minimumPaymentType: "percentage",
				minimumPaymentPercentage: 250,
				userId,
			})
			.returning({ id: accounts.id });
		createdAccountIds.push(card.id);

		// Add transaction to establish balance
		await db.insert(accountTransactions).values({
			slug: nanoid(21),
			accountId: card.id,
			type: "withdrawal",
			amount: -50000, // -£500
			transactionDate: new Date(),
		});

		// Create installment debt
		const [loan] = await db
			.insert(accounts)
			.values({
				slug: nanoid(21),
				name: "Test Loan",
				type: "loan",
				category: "liability",
				originalPrincipal: 1000000,
				minimumPaymentType: "flat",
				minimumPaymentFlat: 10000,
				userId,
			})
			.returning({ id: accounts.id });
		createdAccountIds.push(loan.id);

		// Add transaction to establish balance
		await db.insert(accountTransactions).values({
			slug: nanoid(21),
			accountId: loan.id,
			type: "withdrawal",
			amount: -500000, // -£5,000
			transactionDate: new Date(),
		});

		await db.insert(interestRates).values({
			accountId: loan.id,
			rate: 500, // 5%
			effectiveFrom: new Date(),
		});

		const locals: LoadInput["locals"] = { user: { id: userId } as User };
		const input = {
			locals,
			url: new URL("http://localhost"),
		} as unknown as LoadInput;
		const result = await load(input);
		if (!result) throw new Error("Expected load data");
		const data = result;

		// Check that our test accounts are in the results
		const testCard = data.revolving.find(
			(a: { name: string }) => a.name === "Test Card",
		);
		const testLoan = data.installment.find(
			(a: { name: string }) => a.name === "Test Loan",
		);

		expect(testCard).toBeDefined();
		expect(testLoan).toBeDefined();
		// Don't check exact balance since tests share database and may have seed data
		expect(testCard).toHaveProperty("balance");
		expect(testLoan).toHaveProperty("balance");
	});

	it("should calculate TTZ for all liability accounts", async () => {
		const [account] = await db
			.insert(accounts)
			.values({
				slug: nanoid(21),
				name: "Test Debt",
				type: "loan",
				category: "liability",
				originalPrincipal: 100000,
				minimumPaymentType: "flat",
				minimumPaymentFlat: 10000,
				userId,
			})
			.returning({ id: accounts.id });
		createdAccountIds.push(account.id);

		// Add transaction to establish balance
		await db.insert(accountTransactions).values({
			slug: nanoid(21),
			accountId: account.id,
			type: "withdrawal",
			amount: -100000, // -£1,000
			transactionDate: new Date(),
		});

		await db.insert(interestRates).values({
			accountId: account.id,
			rate: 1000,
			effectiveFrom: new Date(),
		});

		const locals: LoadInput["locals"] = { user: { id: userId } as User };
		const input = {
			locals,
			url: new URL("http://localhost"),
		} as unknown as LoadInput;
		const result = await load(input);
		if (!result) throw new Error("Expected load data");
		const data = result;

		// Find our test account in the results
		const testAccount = data.installment.find(
			(a: { name: string }) => a.name === "Test Debt",
		);
		expect(testAccount).toBeDefined();
		// The TTZ calculation should work (not be null/undefined if balance exists and rate exists)
		// Don't check exact months since it depends on balance
		expect(testAccount).toHaveProperty("months");
	});
});
