import { and, eq, gte, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "$lib/db/client";
import { accounts, accountTransactions } from "$lib/db/schema";
import { devLog, logError, logInfo } from "$lib/server/logger";
import {
	TRANSACTION_TYPES,
	type TransactionType,
} from "$lib/utils/domain-constants";
import { FIELD_LIMITS } from "$lib/utils/fieldLimits";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportRow {
	date: string; // YYYY-MM-DD
	type: TransactionType;
	amount: number; // signed decimal in pounds
	description: string;
	category?: string;
}

export interface ExistingTransaction {
	id: number;
	slug: string;
	type: string;
	amount: number; // in cents
	description: string | null;
	transactionDate: string; // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function poundsToCents(pounds: number): number {
	return Math.round(pounds * 100);
}

// ---------------------------------------------------------------------------
// Server-side row validation
// ---------------------------------------------------------------------------

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
/** £10m per-transaction sanity ceiling (in pounds) */
const MAX_ROW_AMOUNT_POUNDS = 10_000_000;

/**
 * Validate untrusted ImportRow payloads before they reach the database.
 * The import wizard parses client-side, but the action receives raw JSON —
 * so `type`, `amount`, `date`, and `description` must be re-checked here.
 * Returns an error string for the first invalid row, or null when valid.
 */
export function validateImportRows(rows: unknown[]): string | null {
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i] as Record<string, unknown> | null;
		if (row === null || typeof row !== "object") {
			return `Row ${i + 1}: not a valid object`;
		}

		if (
			typeof row.type !== "string" ||
			!TRANSACTION_TYPES.includes(row.type as TransactionType)
		) {
			return `Row ${i + 1}: unknown transaction type`;
		}

		const amount = row.amount;
		if (typeof amount !== "number" || !Number.isFinite(amount)) {
			return `Row ${i + 1}: amount must be a finite number`;
		}
		if (Math.abs(amount) > MAX_ROW_AMOUNT_POUNDS) {
			return `Row ${i + 1}: amount exceeds the maximum allowed`;
		}

		if (
			typeof row.date !== "string" ||
			!DATE_ONLY_REGEX.test(row.date) ||
			Number.isNaN(new Date(`${row.date}T00:00:00.000Z`).getTime())
		) {
			return `Row ${i + 1}: invalid date (use YYYY-MM-DD)`;
		}

		if (row.description !== undefined && row.description !== null) {
			if (typeof row.description !== "string") {
				return `Row ${i + 1}: description must be a string`;
			}
			if (row.description.length > FIELD_LIMITS.NOTE_CONTENT) {
				return `Row ${i + 1}: description too long`;
			}
		}

		if (row.category !== undefined && row.category !== null) {
			if (typeof row.category !== "string" || row.category.length > 100) {
				return `Row ${i + 1}: invalid category`;
			}
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Overlap detection
// ---------------------------------------------------------------------------

/**
 * Fetch all transactions for an account within a date range.
 * Used by the import wizard to detect potential duplicates.
 */
export async function getOverlappingTransactions(
	userId: number,
	accountId: number,
	fromDate: string,
	toDate: string,
): Promise<ExistingTransaction[]> {
	try {
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.id, accountId),
		});

		if (!account) {
			throw new Error(`Account ${accountId} not found`);
		}
		if (account.userId !== userId) {
			throw new Error("User does not own this account");
		}

		const from = new Date(`${fromDate}T00:00:00.000Z`);
		const to = new Date(`${toDate}T23:59:59.999Z`);

		const rows = await db
			.select({
				id: accountTransactions.id,
				slug: accountTransactions.slug,
				type: accountTransactions.type,
				amount: accountTransactions.amount,
				description: accountTransactions.description,
				transactionDate: accountTransactions.transactionDate,
			})
			.from(accountTransactions)
			.where(
				and(
					eq(accountTransactions.accountId, accountId),
					gte(accountTransactions.transactionDate, from),
					lte(accountTransactions.transactionDate, to),
				),
			);

		devLog(
			"getOverlappingTransactions",
			`Found ${rows.length} existing transactions`,
			{
				accountId,
				from: fromDate,
				to: toDate,
			},
		);

		return rows.map((row) => ({
			id: row.id,
			slug: row.slug,
			type: row.type,
			amount: row.amount,
			description: row.description,
			transactionDate: row.transactionDate.toISOString().split("T")[0],
		}));
	} catch (error) {
		logError(
			"getOverlappingTransactions",
			"Failed to fetch overlapping transactions",
			error,
		);
		throw error;
	}
}

// ---------------------------------------------------------------------------
// Batch insert
// ---------------------------------------------------------------------------

/**
 * Insert a batch of parsed transaction rows into an account.
 * All inserts happen inside a single DB transaction for atomicity.
 * Returns the number of rows inserted.
 */
export async function batchInsertTransactions(
	userId: number,
	accountId: number,
	rows: ImportRow[],
): Promise<number> {
	try {
		const account = await db.query.accounts.findFirst({
			where: eq(accounts.id, accountId),
		});

		if (!account) {
			throw new Error(`Account ${accountId} not found`);
		}
		if (account.userId !== userId) {
			throw new Error("User does not own this account");
		}
		if (account.closedAt !== null) {
			throw new Error("Cannot import transactions into a closed account");
		}

		// Re-validate untrusted rows (type enum, finite amounts, dates, lengths)
		const validationError = validateImportRows(rows);
		if (validationError) {
			throw new Error(validationError);
		}

		let inserted = 0;

		db.transaction((tx) => {
			for (const row of rows) {
				tx.insert(accountTransactions)
					.values({
						slug: nanoid(21),
						accountId,
						type: row.type,
						amount: poundsToCents(row.amount),
						description: row.description || null,
						categoryId: null,
						transactionDate: new Date(`${row.date}T00:00:00.000Z`),
					})
					.run();
				inserted++;
			}
		});

		logInfo("batchInsertTransactions", `Inserted ${inserted} transactions`, {
			accountId,
			rowCount: rows.length,
		});

		return inserted;
	} catch (error) {
		logError(
			"batchInsertTransactions",
			"Failed to batch insert transactions",
			error,
		);
		throw error;
	}
}
