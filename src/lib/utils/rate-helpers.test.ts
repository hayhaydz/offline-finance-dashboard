import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { accounts, interestRates } from "$lib/db/schema";
import { getCurrentRate } from "./rate-helpers";

describe("getCurrentRate", () => {
	let testAccountId: number;

	beforeEach(async () => {
		const [account] = await db
			.insert(accounts)
			.values({
				slug: nanoid(21),
				name: "Test Account",
				type: "credit-card",
				category: "liability",
				userId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning({ id: accounts.id });
		testAccountId = account.id;
	});

	afterEach(async () => {
		await db
			.delete(interestRates)
			.where(eq(interestRates.accountId, testAccountId));
		await db.delete(accounts).where(eq(accounts.id, testAccountId));
	});

	it("should return the most recent rate as of today", async () => {
		await db.insert(interestRates).values({
			accountId: testAccountId,
			rate: 1000, // 10%
			effectiveFrom: new Date("2024-01-01"),
		});

		const rate = await getCurrentRate(testAccountId);
		expect(rate).toBe(1000);
	});

	it("should return 0 when no rate exists", async () => {
		const rate = await getCurrentRate(testAccountId);
		expect(rate).toBe(0);
	});

	it("should return future rate after effective date", async () => {
		await db.insert(interestRates).values({
			accountId: testAccountId,
			rate: 0, // 0% promo
			effectiveFrom: new Date("2024-01-01"),
		});

		await db.insert(interestRates).values({
			accountId: testAccountId,
			rate: 2190, // 21.9% post-promo
			effectiveFrom: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
		});

		const rate = await getCurrentRate(testAccountId);
		expect(rate).toBe(0); // Should return current promo rate, not future rate
	});

	it("should handle multiple historical rates correctly", async () => {
		// Insert historical rates
		await db.insert(interestRates).values({
			accountId: testAccountId,
			rate: 500, // 5%
			effectiveFrom: new Date("2023-01-01"),
		});

		await db.insert(interestRates).values({
			accountId: testAccountId,
			rate: 1000, // 10%
			effectiveFrom: new Date("2024-01-01"),
		});

		await db.insert(interestRates).values({
			accountId: testAccountId,
			rate: 1500, // 15%
			effectiveFrom: new Date("2024-06-01"),
		});

		const rate = await getCurrentRate(testAccountId);
		expect(rate).toBe(1500); // Should return the most recent rate
	});
});
