/**
 * Transaction CSV export — single multi-account spreadsheet.
 *
 * One authenticated GET streams every (open) account's transactions in a
 * single CSV keyed by `account_slug` + `id`, with importer-compatible
 * columns. Optional query params scope the file:
 *
 *   ?accounts=slug1,slug2   — restrict to the named accounts
 *   ?from=YYYY-MM-DD        — transaction date >= from (UTC)
 *   ?to=YYYY-MM-DD          — transaction date <= to (UTC, inclusive)
 *   ?type=deposit           — transaction type filter
 *
 * All queries are user-scoped via `withUserFilter` on accounts — rows of
 * other users can never appear in an export.
 */

import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	spendingCategories,
} from "$lib/db/schema";
import {
	serializeTransactionCsv,
	type TransactionCsvRow,
	utcDateString,
} from "$lib/server/csv-format";
import { logError, logInfo } from "$lib/server/logger";
import {
	TRANSACTION_TYPES,
	type TransactionType,
} from "$lib/utils/domain-constants";

// ---------------------------------------------------------------------------
// Export options (query params)
// ---------------------------------------------------------------------------

export interface ExportOptions {
	accountSlugs: string[] | null;
	from: string | null;
	to: string | null;
	type: TransactionType | null;
}

export type ExportOptionsResult =
	| { ok: true; options: ExportOptions }
	| { ok: false; error: string };

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(date: string): boolean {
	return (
		DATE_ONLY_REGEX.test(date) &&
		!Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())
	);
}

/**
 * Parse and validate export query params. Unknown accounts are not an error
 * (they simply produce no rows); malformed dates or types are refused so the
 * caller can surface a 400 instead of silently returning the wrong scope.
 */
export function parseExportOptions(
	params: URLSearchParams,
): ExportOptionsResult {
	const accountSlugs = params
		.get("accounts")
		?.split(",")
		.map((slug) => slug.trim())
		.filter((slug) => slug.length > 0);
	const hasAccounts = accountSlugs !== undefined && accountSlugs.length > 0;

	const from = params.get("from");
	const to = params.get("to");
	if (from !== null && !isValidDate(from)) {
		return { ok: false, error: "Invalid 'from' date (use YYYY-MM-DD)" };
	}
	if (to !== null && !isValidDate(to)) {
		return { ok: false, error: "Invalid 'to' date (use YYYY-MM-DD)" };
	}
	if (from !== null && to !== null && from > to) {
		return { ok: false, error: "'from' date is after 'to' date" };
	}

	const typeParam = params.get("type");
	if (
		typeParam !== null &&
		!(TRANSACTION_TYPES as readonly string[]).includes(typeParam)
	) {
		return { ok: false, error: `Unknown transaction type '${typeParam}'` };
	}

	return {
		ok: true,
		options: {
			accountSlugs: hasAccounts ? accountSlugs : null,
			from,
			to,
			type: typeParam as TransactionType | null,
		},
	};
}

// ---------------------------------------------------------------------------
// CSV builder
// ---------------------------------------------------------------------------

/**
 * Build the multi-account transactions CSV for a user. Rows are ordered by
 * date then id so the file is deterministic. Only open accounts are
 * included (deliberate scope, tested); deleted accounts are excluded by
 * the existence guard on deletedAt.
 */
export async function buildTransactionsCsv(
	userId: number,
	options: ExportOptions,
): Promise<{ csv: string; rowCount: number }> {
	try {
		const conditions = [
			withUserFilter(userId, accounts),
			isNull(accounts.closedAt), // Open accounts only (deliberate export scope)
			isNull(accounts.deletedAt), // Existence guard
		];
		if (options.accountSlugs !== null) {
			// Slugs are unique per table, not per user — the user filter above
			// keeps foreign slugs from matching anything.
			conditions.push(inArray(accounts.slug, options.accountSlugs));
		}
		if (options.from !== null) {
			conditions.push(
				gte(
					accountTransactions.transactionDate,
					new Date(`${options.from}T00:00:00.000Z`),
				),
			);
		}
		if (options.to !== null) {
			conditions.push(
				lte(
					accountTransactions.transactionDate,
					new Date(`${options.to}T23:59:59.999Z`),
				),
			);
		}
		if (options.type !== null) {
			conditions.push(eq(accountTransactions.type, options.type));
		}

		const rows = await db
			.select({
				id: accountTransactions.id,
				transactionDate: accountTransactions.transactionDate,
				type: accountTransactions.type,
				amount: accountTransactions.amount,
				description: accountTransactions.description,
				categoryName: spendingCategories.name,
				accountSlug: accounts.slug,
			})
			.from(accountTransactions)
			.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
			.leftJoin(
				spendingCategories,
				eq(accountTransactions.categoryId, spendingCategories.id),
			)
			.where(and(...conditions))
			.orderBy(
				asc(accountTransactions.transactionDate),
				asc(accountTransactions.id),
			);

		const csv = serializeTransactionCsv(
			rows.map(
				(row): TransactionCsvRow => ({
					accountSlug: row.accountSlug,
					id: String(row.id),
					date: utcDateString(row.transactionDate),
					type: row.type,
					amountCents: row.amount,
					description: row.description,
					category: row.categoryName ?? null,
					deleteFlag: false,
				}),
			),
		);

		return { csv, rowCount: rows.length };
	} catch (error) {
		logError("buildTransactionsCsv", "Failed to build transactions CSV", error);
		throw error;
	}
}

/** Download filename for an export: `transactions-<UTC timestamp>.csv`. */
export function exportFilename(now = new Date()): string {
	const stamp = now
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");
	return `transactions-${stamp}.csv`;
}

/**
 * Export entry point used by the route: parses nothing, builds the CSV and
 * logs the batch summary (counts only, no personal data).
 */
export async function exportTransactionsCsv(
	userId: number,
	options: ExportOptions,
): Promise<{ csv: string; filename: string; rowCount: number }> {
	const { csv, rowCount } = await buildTransactionsCsv(userId, options);
	const filename = exportFilename();
	logInfo("exportTransactionsCsv", `Exported ${rowCount} transaction rows`, {
		accounts: options.accountSlugs ?? "all",
		from: options.from,
		to: options.to,
		type: options.type,
	});
	return { csv, filename, rowCount };
}
