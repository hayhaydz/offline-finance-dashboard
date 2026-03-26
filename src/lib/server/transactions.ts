import { and, desc, eq, gte, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "$lib/db/client";
import { type Account, accounts, accountTransactions } from "$lib/db/schema";
import { devLog, logError } from "$lib/utils/logger";

export type TransactionType = (typeof accountTransactions.$inferInsert)["type"];

export interface CreateTransactionData {
	accountId: number;
	type: TransactionType;
	amount: number; // in cents
	description?: string;
	category?: string;
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
		category: data.category ?? null,
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
		category?: string;
		transactionDate?: Date;
	},
): Promise<{ success: boolean }> {
	const transaction = await getTransactionBySlug(slug);

	if (!transaction) {
		logError("updateTransaction", "Transaction not found", { slug });
		throw new Error("Transaction not found");
	}

	await db
		.update(accountTransactions)
		.set({
			...data,
		})
		.where(eq(accountTransactions.slug, slug));

	devLog("updateTransaction", "Transaction updated", { slug });

	return { success: true };
}

/**
 * Delete a transaction by slug.
 */
export async function deleteTransaction(
	slug: string,
): Promise<{ success: boolean }> {
	const transaction = await getTransactionBySlug(slug);

	if (!transaction) {
		logError("deleteTransaction", "Transaction not found", { slug });
		throw new Error("Transaction not found");
	}

	await db
		.delete(accountTransactions)
		.where(eq(accountTransactions.slug, slug));

	devLog("deleteTransaction", "Transaction deleted", { slug });

	return { success: true };
}

/**
 * Calculate the sum of transactions by type for an account within a date range.
 * Used for ISA allowance calculations and interest totals.
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
	];

	if (toDate) {
		conditions.push(lte(accountTransactions.transactionDate, toDate));
	}

	// Use a raw query to sum amounts
	const result = await db.query.accountTransactions.findMany({
		where: and(...conditions),
		columns: {
			amount: true,
			type: true,
		},
	});

	// Filter by types in memory since Drizzle doesn't support `inArray` with enum types well
	const filtered = result.filter((tx) =>
		types.includes(tx.type as TransactionType),
	);

	return filtered.reduce((sum, tx) => sum + tx.amount, 0);
}
