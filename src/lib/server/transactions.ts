import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "$lib/db/client";
import { type Account, accounts, accountTransactions } from "$lib/db/schema";
import type { TransactionType } from "$lib/utils/domain-constants";
import { devLog, logError } from "$lib/utils/logger";

export type { TransactionType };

export interface CreateTransactionData {
	accountId: number;
	type: TransactionType;
	amount: number; // in cents
	description?: string;
	categoryId?: number | null;
	transactionDate: Date;
}

export interface TransactionFilter {
	accountId?: number;
	type?: TransactionType;
	fromDate?: Date;
	toDate?: Date;
	limit?: number;
	offset?: number;
}

/**
 * Create a new transaction for an account.
 * Generates a unique slug for URL-safe identification.
 */
export async function createTransaction(
	data: CreateTransactionData,
	account: Account,
): Promise<{ success: boolean; transactionSlug: string }> {
	const slug = nanoid(21);

	await db.insert(accountTransactions).values({
		slug,
		accountId: account.id,
		type: data.type,
		amount: data.amount,
		description: data.description ?? null,
		categoryId: data.categoryId ?? null,
		transactionDate: data.transactionDate,
		createdAt: new Date(),
	});

	devLog("createTransaction", "Transaction created", {
		transactionSlug: slug,
		accountId: account.id,
		type: data.type,
		amount: data.amount,
	});

	return { success: true, transactionSlug: slug };
}

/**
 * Get transactions for an account with optional filtering.
 * Returns transactions ordered by date (newest first).
 */
export async function getTransactions(
	userId: number,
	filter: TransactionFilter = {},
) {
	const conditions = [eq(accounts.userId, userId)];

	if (filter.accountId) {
		conditions.push(eq(accountTransactions.accountId, filter.accountId));
	}

	if (filter.type) {
		conditions.push(eq(accountTransactions.type, filter.type));
	}

	if (filter.fromDate) {
		conditions.push(gte(accountTransactions.transactionDate, filter.fromDate));
	}

	if (filter.toDate) {
		conditions.push(lte(accountTransactions.transactionDate, filter.toDate));
	}

	const rows = await db
		.select({
			transaction: accountTransactions,
			account: {
				id: accounts.id,
				slug: accounts.slug,
				name: accounts.name,
				type: accounts.type,
				taxWrapper: accounts.taxWrapper,
			},
		})
		.from(accountTransactions)
		.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
		.where(and(...conditions))
		.orderBy(desc(accountTransactions.transactionDate))
		.limit(filter.limit ?? 50)
		.offset(filter.offset ?? 0);

	return rows.map((row) => ({
		...row.transaction,
		account: row.account,
	}));
}

/**
 * Get a single transaction by slug.
 * Returns null if not found.
 */
export async function getTransactionBySlug(slug: string) {
	return db.query.accountTransactions.findFirst({
		where: eq(accountTransactions.slug, slug),
		with: {
			account: {
				columns: {
					id: true,
					slug: true,
					name: true,
					type: true,
					taxWrapper: true,
					userId: true,
				},
			},
		},
	});
}

/**
 * Update a transaction by slug.
 * Only allows updating certain fields.
 */
export async function updateTransaction(
	slug: string,
	data: {
		type?: TransactionType;
		amount?: number;
		description?: string;
		categoryId?: number | null;
		transactionDate?: Date;
	},
): Promise<{ success: boolean }> {
	const result = await db
		.update(accountTransactions)
		.set(data)
		.where(eq(accountTransactions.slug, slug))
		.returning({ slug: accountTransactions.slug });

	if (result.length === 0) {
		logError("updateTransaction", "Transaction not found", { slug });
		throw new Error("Transaction not found");
	}

	devLog("updateTransaction", "Transaction updated", { slug });

	return { success: true };
}

/**
 * Delete a transaction by slug.
 */
export async function deleteTransaction(
	slug: string,
): Promise<{ success: boolean }> {
	const result = await db
		.delete(accountTransactions)
		.where(eq(accountTransactions.slug, slug))
		.returning({ slug: accountTransactions.slug });

	if (result.length === 0) {
		logError("deleteTransaction", "Transaction not found", { slug });
		throw new Error("Transaction not found");
	}

	devLog("deleteTransaction", "Transaction deleted", { slug });

	return { success: true };
}

/**
 * Calculate the sum of transactions by type for an account within a date range.
 * Uses SQL SUM aggregation for efficiency — no client-side filtering or reducing.
 */
export async function getTransactionSum(
	accountId: number,
	types: TransactionType[],
	fromDate: Date,
	toDate?: Date,
): Promise<number> {
	const conditions = [
		eq(accountTransactions.accountId, accountId),
		gte(accountTransactions.transactionDate, fromDate),
		inArray(accountTransactions.type, types),
	];

	if (toDate) {
		conditions.push(lte(accountTransactions.transactionDate, toDate));
	}

	const rows = await db
		.select({
			total: sql<number>`coalesce(sum(${accountTransactions.amount}), 0)`,
		})
		.from(accountTransactions)
		.where(and(...conditions));

	return Number(rows[0]?.total ?? 0);
}
