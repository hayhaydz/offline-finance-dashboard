import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	budgetMonths,
	spendingCategories,
	users,
} from "$lib/db/schema";
import {
	getBudgetHistory,
	getBudgetStatus,
	getCategoryBreakdown,
} from "./budgets";

let testUserId: number;
let currentAccountId: number;
let cardAccountId: number;
const cleanupAccountIds: number[] = [];
let cleanupCategoryId: number | null = null;
const cleanupMonthKeys: string[] = [];

/** Fixed historical month so days-elapsed logic can't interfere */
const YEAR = 2026;
const MONTH = 1; // January 2026
const MONTH_KEY = "2026-01";

function jan(day: number): Date {
	return new Date(YEAR, MONTH - 1, day, 12, 0, 0);
}

async function insertTx(
	accountId: number,
	values: {
		type: string;
		amount: number;
		categoryId?: number | null;
		day: number;
		description?: string;
	},
) {
	await db.insert(accountTransactions).values({
		slug: nanoid(21),
		accountId,
		type: values.type as never,
		amount: values.amount,
		categoryId: values.categoryId ?? null,
		description: values.description ?? null,
		transactionDate: jan(values.day),
	});
}

beforeAll(async () => {
	const [user] = await db
		.insert(users)
		.values({
			username: `budgets-user-${Date.now()}-${nanoid(6)}`,
			passwordHash: "hash",
			passwordSalt: "salt",
		})
		.returning({ id: users.id });
	testUserId = user.id;

	const [current] = await db
		.insert(accounts)
		.values({
			slug: nanoid(16),
			userId: testUserId,
			name: "Budget Test Current",
			type: "current",
			taxWrapper: "none",
			category: "asset",
		})
		.returning();
	currentAccountId = current.id;
	cleanupAccountIds.push(currentAccountId);

	const [card] = await db
		.insert(accounts)
		.values({
			slug: nanoid(16),
			userId: testUserId,
			name: "Budget Test Card",
			type: "credit-card",
			taxWrapper: "none",
			category: "liability",
		})
		.returning();
	cardAccountId = card.id;
	cleanupAccountIds.push(cardAccountId);

	const [category] = await db
		.insert(spendingCategories)
		.values({
			slug: nanoid(16),
			userId: testUserId,
			name: "Budget Test Groceries",
			key: `budget-test-${nanoid(6)}`,
			colour: "#000000",
		})
		.returning({ id: spendingCategories.id });
	cleanupCategoryId = category.id;

	await db.insert(budgetMonths).values({
		userId: testUserId,
		month: MONTH_KEY,
		totalTargetInCents: 10000,
		excludedCategoryIds: [],
		excludedAccountIds: [],
		categoryTargets: {},
	});
	cleanupMonthKeys.push(MONTH_KEY);

	// Spec scenario: £50 withdrawal + £20 refund in same category → £30
	await insertTx(currentAccountId, {
		type: "withdrawal",
		amount: -5000,
		categoryId: category.id,
		day: 5,
		description: "Groceries",
	});
	await insertTx(currentAccountId, {
		type: "refund",
		amount: 2000,
		categoryId: category.id,
		day: 8,
		description: "Grocery refund",
	});
	// Excluded types: liability repayment + internal transfer
	await insertTx(cardAccountId, {
		type: "payment",
		amount: 10000,
		day: 10,
		description: "Card payment",
	});
	await insertTx(currentAccountId, {
		type: "transfer_out",
		amount: -3000,
		day: 12,
		description: "To savings",
	});
	// Card charge counts: £10
	await insertTx(cardAccountId, {
		type: "charge",
		amount: -1000,
		categoryId: category.id,
		day: 15,
		description: "Card spend",
	});
});

afterAll(async () => {
	for (const accountId of cleanupAccountIds) {
		await db
			.delete(accountTransactions)
			.where(eq(accountTransactions.accountId, accountId));
	}
	if (cleanupCategoryId !== null) {
		await db
			.delete(spendingCategories)
			.where(eq(spendingCategories.id, cleanupCategoryId));
	}
	if (cleanupMonthKeys.length > 0) {
		// Includes 2026-02: the Feb status check rolls the budget forward to it
		await db
			.delete(budgetMonths)
			.where(
				inArray(budgetMonths.month, [
					MONTH_KEY,
					`${YEAR}-${String(MONTH + 1).padStart(2, "0")}`,
				]),
			);
	}
	for (const accountId of cleanupAccountIds) {
		await db.delete(accounts).where(eq(accounts.id, accountId));
	}
	await db.delete(users).where(eq(users.id, testUserId));
});

describe("budget spending definition (withdrawal + charge − refund)", () => {
	it("getBudgetStatus nets refunds and excludes payments/transfers", async () => {
		const status = await getBudgetStatus(testUserId, YEAR, MONTH);

		// £50 withdrawal + £10 charge − £20 refund = £40
		// payment (£100) and transfer_out (£30) excluded
		expect(status.totalSpent).toBe(4000);
	});

	it("getBudgetStatus returns zero spending for a month with only refunds", async () => {
		const status = await getBudgetStatus(testUserId, YEAR, MONTH + 1); // Feb: no tx
		expect(status.totalSpent).toBe(0);
	});

	it("getCategoryBreakdown nets refunds per category", async () => {
		const breakdown = await getCategoryBreakdown(testUserId, YEAR, MONTH, null);
		const groceries = breakdown.find((c) => c.id === cleanupCategoryId);
		expect(groceries).toBeDefined();
		// £50 withdrawal + £10 charge − £20 refund = £40
		expect(groceries?.spent).toBe(4000);
		// Nothing lands in uncategorised
		const uncategorised = breakdown.find((c) => c.name === "Uncategorised");
		expect(uncategorised?.spent).toBe(0);
	});

	it("getBudgetHistory uses the same definition", async () => {
		const history = await getBudgetHistory(testUserId, 0, 12);
		const jan = history.months.find((m) => m.month === MONTH_KEY);
		expect(jan).toBeDefined();
		expect(jan?.actualSpent).toBe(4000);
	});
});
