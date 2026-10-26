import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { accounts, accountTransactions, users } from "$lib/db/schema";
import {
	listRefundCandidates,
	reclassifyValueChangeRefunds,
} from "./refund-reclassification";

let testUserId: number;
let cardAccountId: number;
let savingsAccountId: number;
const cleanupAccountIds: number[] = [];
const cleanupTxSlugs: string[] = [];

async function insertTx(
	accountId: number,
	values: {
		type: string;
		amount: number;
		description?: string;
	},
) {
	const slug = nanoid(21);
	cleanupTxSlugs.push(slug);
	await db.insert(accountTransactions).values({
		slug,
		accountId,
		type: values.type as never,
		amount: values.amount,
		categoryId: null,
		description: values.description ?? null,
		transactionDate: new Date(2026, 5, 15, 12, 0, 0),
	});
	return slug;
}

beforeAll(async () => {
	const [user] = await db
		.insert(users)
		.values({
			username: `reclass-user-${Date.now()}-${nanoid(6)}`,
			passwordHash: "hash",
			passwordSalt: "salt",
		})
		.returning({ id: users.id });
	testUserId = user.id;

	const [card] = await db
		.insert(accounts)
		.values({
			slug: nanoid(16),
			userId: testUserId,
			name: "Reclass Test Card",
			type: "credit-card",
			taxWrapper: "none",
			category: "liability",
		})
		.returning();
	cardAccountId = card.id;
	cleanupAccountIds.push(cardAccountId);

	const [savings] = await db
		.insert(accounts)
		.values({
			slug: nanoid(16),
			userId: testUserId,
			name: "Reclass Test Savings",
			type: "savings",
			taxWrapper: "none",
			category: "asset",
		})
		.returning();
	savingsAccountId = savings.id;
	cleanupAccountIds.push(savingsAccountId);
});

afterAll(async () => {
	for (const slug of cleanupTxSlugs) {
		await db
			.delete(accountTransactions)
			.where(eq(accountTransactions.slug, slug));
	}
	for (const accountId of cleanupAccountIds) {
		await db.delete(accounts).where(eq(accounts.id, accountId));
	}
	await db.delete(users).where(eq(users.id, testUserId));
});

describe("refund reclassification utility", () => {
	it("lists only negative value_change rows on credit cards", async () => {
		// Candidates: negative value_change on the card
		await insertTx(cardAccountId, {
			type: "value_change",
			amount: -2500,
			description: "Old card refund",
		});
		// Not a candidate: positive value_change on the card
		await insertTx(cardAccountId, {
			type: "value_change",
			amount: 1000,
			description: "Card fee adjustment",
		});
		// Not a candidate: negative value_change on a savings account
		await insertTx(savingsAccountId, {
			type: "value_change",
			amount: -900,
			description: "Market dip",
		});

		const candidates = await listRefundCandidates(testUserId);
		expect(candidates).toHaveLength(1);
		expect(candidates[0].amount).toBe(-2500);
		expect(candidates[0].accountName).toBe("Reclass Test Card");
	});

	it("reclassifies candidates to refund, preserving amounts, and reports the count", async () => {
		const reclassified = await reclassifyValueChangeRefunds(testUserId);
		expect(reclassified).toBe(1);

		const rows = await db.query.accountTransactions.findMany({
			where: eq(accountTransactions.accountId, cardAccountId),
		});
		const refunded = rows.find((r) => r.type === "refund");
		expect(refunded).toBeDefined();
		expect(refunded?.amount).toBe(-2500);
		expect(refunded?.description).toBe("Old card refund");

		// Positive value_change untouched
		expect(
			rows.find((r) => r.type === "value_change" && r.amount === 1000),
		).toBeDefined();

		// Savings account untouched
		const savingsRows = await db.query.accountTransactions.findMany({
			where: eq(accountTransactions.accountId, savingsAccountId),
		});
		expect(savingsRows.find((r) => r.type === "refund")).toBeUndefined();
	});

	it("is idempotent — second run reports zero rows", async () => {
		expect(await reclassifyValueChangeRefunds(testUserId)).toBe(0);
	});
});
