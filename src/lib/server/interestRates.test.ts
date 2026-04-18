import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { accounts, interestRates, users } from "$lib/db/schema";
import {
	createInterestRate,
	deleteInterestRate,
	updateInterestRate,
} from "./interestRates";

describe("Interest Rates CRUD", () => {
	let testUserId: number;
	let testAccountId: number;
	let createdUserIds: number[] = [];
	let createdAccountIds: number[] = [];
	let createdRateIds: number[] = [];

	beforeEach(async () => {
		// Create test user
		const [user] = await db
			.insert(users)
			.values({
				username: `test-user-rates-${Date.now()}`,
				passwordHash: "hash",
				totpSecret: "secret",
				totpSecretIV: "iv",
				passwordSalt: "salt",
				taxBand: "basic",
			})
			.returning();
		testUserId = user.id;
		createdUserIds.push(user.id);

		// Create test account
		const [account] = await db
			.insert(accounts)
			.values({
				slug: `test-account-rates-${Date.now()}`,
				userId: testUserId,
				name: "Test Account",
				type: "savings",
				taxWrapper: "none",
				category: "asset",
			})
			.returning();
		testAccountId = account.id;
		createdAccountIds.push(account.id);
	});

	// Cleanup after each test
	afterEach(async () => {
		// Delete rates first (foreign key constraint)
		if (createdRateIds.length > 0) {
			await db
				.delete(interestRates)
				.where(inArray(interestRates.id, createdRateIds));
		}
		// Delete accounts
		for (const accountId of createdAccountIds) {
			await db.delete(accounts).where(eq(accounts.id, accountId));
		}
		// Delete users
		for (const userId of createdUserIds) {
			await db.delete(users).where(eq(users.id, userId));
		}
		// Reset arrays
		createdUserIds = [];
		createdAccountIds = [];
		createdRateIds = [];
	});

	it("should create an interest rate and return rateId", async () => {
		const account = { id: testAccountId } as any;
		const result = await createInterestRate(
			{
				accountId: testAccountId,
				rate: 450, // 4.50%
				effectiveFrom: new Date("2025-01-01"),
			},
			account,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return; // type narrowing
		expect(result.data).toBeTypeOf("number");
		expect(result.data).toBeGreaterThan(0);
		createdRateIds.push(result.data);
	});

	it("should delete an existing interest rate", async () => {
		const account = { id: testAccountId } as any;
		const created = await createInterestRate(
			{
				accountId: testAccountId,
				rate: 300,
				effectiveFrom: new Date("2025-01-01"),
			},
			account,
		);
		if (!created.ok) throw new Error("setup failed");
		createdRateIds.push(created.data);

		const result = await deleteInterestRate(created.data);
		expect(result.ok).toBe(true);
	});

	it("should return error when deleting non-existent interest rate", async () => {
		const result = await deleteInterestRate(999999);
		expect(result.ok).toBe(false);
		if (result.ok) return; // type narrowing
		expect(result.error).toContain("not found");
	});

	it("should update an existing interest rate", async () => {
		const account = { id: testAccountId } as any;
		const created = await createInterestRate(
			{
				accountId: testAccountId,
				rate: 300,
				effectiveFrom: new Date("2025-01-01"),
			},
			account,
		);
		if (!created.ok) throw new Error("setup failed");
		createdRateIds.push(created.data);

		const result = await updateInterestRate(created.data, {
			rate: 500,
		});
		expect(result.ok).toBe(true);
	});

	it("should return error when updating non-existent interest rate", async () => {
		const result = await updateInterestRate(999999, { rate: 500 });
		expect(result.ok).toBe(false);
		if (result.ok) return; // type narrowing
		expect(result.error).toContain("not found");
	});
});
