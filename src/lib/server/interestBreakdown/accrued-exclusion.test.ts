import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { accounts, accountTransactions, users } from "$lib/db/schema";
import {
	getCurrentBalanceForAccount,
	getMonthlyBalanceHistory,
} from "$lib/server/derivedBalances";
import { getActualInterestBreakdown } from "$lib/server/interestBreakdown/aggregations";

let testUserId: number;
let savingsAccountId: number;
const cleanupAccountIds: number[] = [];

// 2026/27 UK tax year: 6 April 2026 → 5 April 2027
const TAX_YEAR_START = new Date(2026, 3, 6);
const TAX_YEAR_END = new Date(2027, 3, 5);

function inTaxYear(month: number, day: number): Date {
	return new Date(2026, month - 1, day, 12, 0, 0);
}

async function insertTx(
	accountId: number,
	values: {
		type: string;
		amount: number;
		date: Date;
		description?: string;
	},
) {
	await db.insert(accountTransactions).values({
		slug: nanoid(21),
		accountId,
		type: values.type as never,
		amount: values.amount,
		categoryId: null,
		description: values.description ?? null,
		transactionDate: values.date,
	});
}

beforeAll(async () => {
	const [user] = await db
		.insert(users)
		.values({
			username: `accrued-user-${Date.now()}-${nanoid(6)}`,
			passwordHash: "hash",
			passwordSalt: "salt",
		})
		.returning({ id: users.id });
	testUserId = user.id;

	const [savings] = await db
		.insert(accounts)
		.values({
			slug: nanoid(16),
			userId: testUserId,
			name: "Accrued Test Savings",
			type: "savings",
			taxWrapper: "none",
			category: "asset",
		})
		.returning();
	savingsAccountId = savings.id;
	cleanupAccountIds.push(savingsAccountId);

	await insertTx(savingsAccountId, {
		type: "deposit",
		amount: 500000,
		date: inTaxYear(4, 10),
		description: "Opening deposit",
	});
	await insertTx(savingsAccountId, {
		type: "interest",
		amount: 10000,
		date: inTaxYear(6, 1),
		description: "Interest paid",
	});
	await insertTx(savingsAccountId, {
		type: "interest_accrued",
		amount: 5000,
		date: inTaxYear(7, 1),
		description: "Unrealised accrual",
	});
});

afterAll(async () => {
	for (const accountId of cleanupAccountIds) {
		await db
			.delete(accountTransactions)
			.where(eq(accountTransactions.accountId, accountId));
	}
	for (const accountId of cleanupAccountIds) {
		await db.delete(accounts).where(eq(accounts.id, accountId));
	}
	await db.delete(users).where(eq(users.id, testUserId));
});

describe("interest_accrued exclusion from actuals", () => {
	it("only interest rows contribute to taxable/tax-free actuals", async () => {
		const actual = await getActualInterestBreakdown(
			testUserId,
			TAX_YEAR_START,
			TAX_YEAR_END,
		);

		// £100 paid interest, NOT £150 with the accrual
		expect(actual.total).toBe(10000);
		expect(actual.taxableTotal).toBe(10000);
		expect(actual.taxFreeTotal).toBe(0);
		expect(actual.byAccount).toHaveLength(1);
		expect(actual.byAccount[0].total).toBe(10000);
		expect(actual.byMonth).toHaveLength(1);
		expect(actual.byMonth[0].total).toBe(10000);
	});

	it("accrued rows are excluded from the actual transactions list", async () => {
		const actual = await getActualInterestBreakdown(
			testUserId,
			TAX_YEAR_START,
			TAX_YEAR_END,
		);
		expect(
			actual.transactions.filter((t) => t.type === "interest_accrued"),
		).toHaveLength(0);
	});

	it("accrued interest does not inflate the cash balance", async () => {
		// deposit £5000 + interest £100, accrual £50 excluded
		expect(await getCurrentBalanceForAccount(savingsAccountId)).toBe(510000);
	});

	it("monthly balance history excludes accruals", async () => {
		const history = await getMonthlyBalanceHistory(savingsAccountId, 12);
		const last = history[history.length - 1];
		expect(last.closingBalance).toBe(510000);
	});
});
