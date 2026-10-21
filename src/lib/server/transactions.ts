import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import {
	type Account,
	accounts,
	accountTransactions,
	spendingCategories,
} from "$lib/db/schema";
import {
	decryptTxDescription,
	encryptTxDescription,
} from "$lib/server/crypto/protected-fields";
import { logError, logInfo } from "$lib/server/logger";
import {
	err,
	ok,
	okVoid,
	type Result,
	type VoidResult,
} from "$lib/server/utils/result";
import type { TransactionType } from "$lib/utils/domain-constants";

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
): Promise<Result<string>> {
	const slug = nanoid(21);

	// Ownership check on the client-supplied category reference
	// (auth-session-hardening): a foreign/unknown category id is
	// neutralized to "no category" instead of persisted — same UX as the
	// importer, and no cross-user reference ever reaches the DB.
	let categoryId = data.categoryId ?? null;
	if (categoryId !== null) {
		const ownedCategory = await db.query.spendingCategories.findFirst({
			where: and(
				eq(spendingCategories.id, categoryId),
				eq(spendingCategories.userId, account.userId),
				isNull(spendingCategories.deletedAt),
			),
			columns: { id: true },
		});
		if (!ownedCategory) {
			categoryId = null;
			logInfo("createTransaction", "Foreign categoryId dropped", {
				transactionSlug: slug,
				categoryId: data.categoryId,
			});
		}
	}

	await db.insert(accountTransactions).values({
		slug,
		accountId: account.id,
		type: data.type,
		amount: data.amount,
		// Value layer: description encrypted under the account owner's
		// DataKey, AAD-bound to this transaction's slug.
		description: encryptTxDescription(
			account.userId,
			slug,
			data.description ?? null,
		),
		categoryId,
		transactionDate: data.transactionDate,
		createdAt: new Date(),
	});

	logInfo("createTransaction", "Transaction created", {
		transactionSlug: slug,
		accountId: account.id,
		type: data.type,
		amount: data.amount,
	});

	return ok(slug);
}

/**
 * Get transactions for an account with optional filtering.
 * Returns transactions ordered by date (newest first).
 */
export async function getTransactions(
	userId: number,
	filter: TransactionFilter = {},
) {
	const conditions = [withUserFilter(userId, accounts)];

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
		description: decryptTxDescription(
			userId,
			row.transaction.slug,
			row.transaction.description,
		),
		account: row.account,
	}));
}

/**
 * Get a single transaction by slug.
 * Returns null if not found.
 */
export async function getTransactionBySlug(slug: string) {
	const tx = await db.query.accountTransactions.findFirst({
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
	if (!tx) return tx;
	return {
		...tx,
		description: decryptTxDescription(
			tx.account.userId,
			tx.slug,
			tx.description,
		),
	};
}

/**
 * Delete a transaction by slug.
 */
export async function deleteTransaction(slug: string): Promise<VoidResult> {
	const result = await db
		.delete(accountTransactions)
		.where(eq(accountTransactions.slug, slug))
		.returning({ slug: accountTransactions.slug });

	if (result.length === 0) {
		logError("deleteTransaction", "Transaction not found", { slug });
		return err("Transaction not found");
	}

	logInfo("deleteTransaction", "Transaction deleted", { slug });

	return okVoid();
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
