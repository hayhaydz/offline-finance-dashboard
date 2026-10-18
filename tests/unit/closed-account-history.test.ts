import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "$lib/db/client";
import { accounts, accountTransactions, users } from "$lib/db/schema";
import { getNetWorthSummary } from "$lib/server/finance";
import { getInterestTransactions } from "$lib/server/interestBreakdown/queries";
import {
	getActualInterestEarned,
	getISAAllowanceUsed,
} from "$lib/server/tax-year-queries";
import { getUkTaxYearBounds } from "$lib/utils/tax-year-utils";

/**
 * Existence vs openness test matrix (change: account-delete-vs-close).
 *
 * - Deleted accounts are invisible everywhere (deletedAt marker).
 * - Closed accounts are invisible in open-account lists (net worth) but
 *   present in interest/ISA/tax-year history.
 */

let testUserId: number;
const createdUserIds: number[] = [];
const createdAccountIds: number[] = [];

// Previous UK tax year (2025/26 when "now" is in 2026/27)
const prevTaxYear = getUkTaxYearBounds(new Date("2025-09-15T00:00:00.000Z"));

async function insertUser(): Promise<number> {
	const [user] = await db
		.insert(users)
		.values({
			username: `hist-integrity-${Date.now()}-${nanoid(6)}`,
			passwordHash: "hash",
			totpSecret: "secret",
			totpSecretIV: "iv",
			passwordSalt: "salt",
		})
		.returning({ id: users.id });
	createdUserIds.push(user.id);
	return user.id;
}

async function insertAccount(options: {
	name: string;
	type?: "savings" | "current";
	taxWrapper?: "none" | "isa";
}): Promise<{ id: number; slug: string }> {
	const [account] = await db
		.insert(accounts)
		.values({
			slug: nanoid(16),
			userId: testUserId,
			name: options.name,
			type: options.type ?? "savings",
			taxWrapper: options.taxWrapper ?? "none",
			category: "asset",
			excludedFromNetWorth: false,
		})
		.returning({ id: accounts.id, slug: accounts.slug });
	createdAccountIds.push(account.id);
	return account;
}

async function insertInterestTx(
	accountId: number,
	amountCents: number,
): Promise<void> {
	await db.insert(accountTransactions).values({
		slug: nanoid(21),
		accountId,
		type: "interest",
		amount: amountCents,
		description: "history integrity fixture",
		categoryId: null,
		transactionDate: new Date("2025-11-15T00:00:00.000Z"),
	});
}

async function insertDepositTx(
	accountId: number,
	amountCents: number,
): Promise<void> {
	await db.insert(accountTransactions).values({
		slug: nanoid(21),
		accountId,
		type: "deposit",
		amount: amountCents,
		description: "history integrity fixture",
		categoryId: null,
		transactionDate: new Date("2025-10-01T00:00:00.000Z"),
	});
}

let closedSavings: { id: number; slug: string };
let openSavings: { id: number; slug: string };
let closedIsa: { id: number; slug: string };
let deletedMarker: { id: number; slug: string };

beforeAll(async () => {
	testUserId = await insertUser();

	// Closed savings with interest history in the previous tax year.
	// (Transactions first, then close — the DB refuses inserts on closed rows.)
	closedSavings = await insertAccount({ name: "Closed Saver" });
	await insertDepositTx(closedSavings.id, 100000);
	await insertInterestTx(closedSavings.id, 5000);
	await db
		.update(accounts)
		.set({ closedAt: new Date("2026-06-30T00:00:00.000Z") })
		.where(eq(accounts.id, closedSavings.id));

	// Open savings with interest in the same tax year
	openSavings = await insertAccount({ name: "Open Saver" });
	await insertDepositTx(openSavings.id, 50000);
	await insertInterestTx(openSavings.id, 3000);

	// Closed ISA with a previous-tax-year subscription (history counts)
	closedIsa = await insertAccount({ name: "Closed ISA", taxWrapper: "isa" });
	await insertDepositTx(closedIsa.id, 20000);
	await db
		.update(accounts)
		.set({ closedAt: new Date("2026-01-15T00:00:00.000Z") })
		.where(eq(accounts.id, closedIsa.id));

	// deletedAt-marked account with an interest row: invisible everywhere,
	// even though the row physically exists (existence semantics). Also
	// closed so the openness-only net-worth query excludes it independently —
	// the interest assertions below prove the deletedAt filter on their own.
	deletedMarker = await insertAccount({ name: "Marked Deleted" });
	await insertInterestTx(deletedMarker.id, 1000);
	await db
		.update(accounts)
		.set({
			closedAt: new Date("2026-09-20T00:00:00.000Z"),
			deletedAt: new Date("2026-10-01T00:00:00.000Z"),
		})
		.where(eq(accounts.id, deletedMarker.id));
});

afterAll(async () => {
	if (createdAccountIds.length > 0) {
		await db
			.delete(accountTransactions)
			.where(inArray(accountTransactions.accountId, createdAccountIds));
		await db.delete(accounts).where(inArray(accounts.id, createdAccountIds));
	}
	for (const id of createdUserIds) {
		await db.delete(users).where(eq(users.id, id));
	}
});

describe("history integrity — closed accounts stay counted", () => {
	it("includes closed accounts' interest in actual tax-year interest", async () => {
		const total = await getActualInterestEarned(
			testUserId,
			prevTaxYear.start,
			prevTaxYear.end,
		);
		// 5000 (closed) + 3000 (open); the deletedAt-marked account's 1000
		// must NOT be counted
		expect(total).toBe(8000);
	});

	it("includes closed accounts in the interest breakdown ledger", async () => {
		const transactions = await getInterestTransactions(
			testUserId,
			prevTaxYear.start,
			prevTaxYear.end,
		);
		const closedRows = transactions.filter(
			(tx) => tx.accountId === closedSavings.id && tx.type === "interest",
		);
		expect(closedRows).toHaveLength(1);
		expect(closedRows[0].amount).toBe(5000);

		// The deletedAt-marked account has no rows and no opening row
		expect(transactions.some((tx) => tx.accountId === deletedMarker.id)).toBe(
			false,
		);
	});

	it("includes closed ISA subscriptions in historic allowance usage", async () => {
		const used = await getISAAllowanceUsed(
			testUserId,
			prevTaxYear.start,
			prevTaxYear.end,
		);
		expect(used).toBe(20000);
	});
});

describe("open lists — closed accounts stay out, deleted invisible", () => {
	it("excludes the closed account from net worth (open-accounts only)", async () => {
		const summary = await getNetWorthSummary(testUserId);
		// Only the open saver counts: 50000 deposit + 3000 interest
		expect(summary.totalAssets).toBe(53000);
	});
});
