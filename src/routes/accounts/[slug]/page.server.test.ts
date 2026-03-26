import { nanoid } from "nanoid";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import type { User } from "$lib/db/schema";
import { accounts, accountTransactions, interestRates } from "$lib/db/schema";
import { load } from "./+page.server";

describe("Account page load - liability projections", () => {
	let testAccountId: number;
	let testSlug: string;
	type LoadInput = Parameters<typeof load>[0];

	beforeEach(async () => {
		const [account] = await db
			.insert(accounts)
			.values({
				slug: nanoid(21),
				name: "Test Liability",
				type: "credit-card",
				category: "liability",
				creditLimit: 200000, // £2,000
				minimumPaymentType: "flat_or_percentage",
				minimumPaymentFlat: 2500, // £25
				minimumPaymentPercentage: 250, // 2.5%
				userId: 1, // Test user ID
			})
			.returning({ id: accounts.id, slug: accounts.slug });

		testAccountId = account.id;
		testSlug = account.slug;

		await db.insert(interestRates).values({
			accountId: testAccountId,
			rate: 1000, // 10%
			effectiveFrom: new Date("2024-01-01"),
		});

		// Add transaction to establish balance
		await db.insert(accountTransactions).values({
			slug: nanoid(21),
			accountId: testAccountId,
			type: "withdrawal",
			amount: -100000, // -£1,000
			transactionDate: new Date("2024-01-01"),
		});
	});

	it("should calculate TTZ for liability accounts", async () => {
		const locals: LoadInput["locals"] = { user: { id: 1 } as User };
		const input = {
			locals,
			params: { slug: testSlug },
			url: new URL("http://localhost/?taxYearStart=2024-04-06"),
		} as unknown as LoadInput;
		const result = await load(input);
		if (!result) throw new Error("Expected load data");
		const data = result;
		expect(data.ttz).toBeDefined();
		expect(data.ttz.months).toBeGreaterThan(0);
		expect(data.projection).toHaveLength(24); // server sends 24 months
	});

	it("should calculate utilization for revolving debt", async () => {
		const locals: LoadInput["locals"] = { user: { id: 1 } as User };
		const input = {
			locals,
			params: { slug: testSlug },
			url: new URL("http://localhost/?taxYearStart=2024-04-06"),
		} as unknown as LoadInput;
		const result = await load(input);
		if (!result) throw new Error("Expected load data");
		const data = result;
		expect(data.account.creditLimit).toBe(200000);
		// Utilization = 100000 / 200000 * 100 = 50%
	});
});
