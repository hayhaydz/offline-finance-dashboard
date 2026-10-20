/**
 * Unified CSV reimport engine — insert, edit and delete in one file.
 *
 * Row semantics (design decision 2):
 *   - `id` present + `_delete=1`  → hard-delete the matched row
 *   - `id` present                → edit the matched row (fields that differ)
 *   - `id` absent                 → insert, resolved via `account_slug`
 *
 * Safety chain = preview → backup → commit:
 *   1. `previewReimport` parses + validates every field with the
 *      append-import validators, resolves ids/slugs against the user's own
 *      data (RLS — never trusting the CSV), and computes exact counts plus
 *      per-row field diffs without writing.
 *   2. `commitReimport` re-runs the plan, writes a timestamped "before" CSV
 *      of every touched row's pre-state, then applies the whole file in one
 *      DB transaction (atomic all-or-nothing).
 *
 * Recovery mode (design decision 4) is an explicit toggle for backup files:
 * it upserts by `id` (restores values, reinserts deleted rows with their
 * original ids). Normal mode never upserts — unmatched ids are typos and the
 * file is refused. Unknown/foreign ids and id/slug mismatches are refused at
 * file level with row numbers.
 */

import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import {
	accounts,
	accountTransactions,
	spendingCategories,
} from "$lib/db/schema";
import {
	decryptTxDescription,
	encryptTxDescription,
} from "$lib/server/crypto/protected-fields";
import {
	BACKUP_HEADER_PREFIX,
	parseBackupHeaderLine,
	serializeTransactionCsv,
	TRANSACTION_CSV_HEADER,
	type TransactionCsvRow,
	utcDateString,
} from "$lib/server/csv-format";
import { validateImportRows } from "$lib/server/imports";
import { logInfo } from "$lib/server/logger";
import type { TransactionType } from "$lib/utils/domain-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A parsed (syntax-valid) row of a reimport file. Amounts in pounds. */
export interface UpdateCsvRow {
	rowNumber: number; // 1-based within the data rows (header excluded)
	accountSlug: string;
	id: number | null;
	date: string; // YYYY-MM-DD
	type: string;
	amount: number; // signed pounds
	description: string;
	category: string; // "" when empty
	deleteFlag: boolean;
}

export interface FieldDiff {
	field: "date" | "type" | "amount" | "description" | "category";
	before: string;
	after: string;
}

export interface PlannedEdit {
	rowNumber: number;
	id: number;
	accountSlug: string;
	diffs: FieldDiff[];
}

export interface PlannedInsert {
	rowNumber: number;
	accountSlug: string;
	date: string;
	type: string;
	amount: number;
	description: string;
	category: string;
}

export interface PlannedDelete {
	rowNumber: number;
	id: number;
	accountSlug: string;
	date: string;
	type: string;
	amount: number; // pounds
	description: string;
}

export interface ReimportCounts {
	inserted: number;
	edited: number;
	deleted: number;
	skipped: number;
}

export type PreviewResult =
	| {
			ok: true;
			counts: ReimportCounts;
			edits: PlannedEdit[];
			inserts: PlannedInsert[];
			deletes: PlannedDelete[];
			isBackup: boolean;
	  }
	| {
			ok: false;
			errors: string[];
			isBackup: boolean;
	  };

export interface CommitResult {
	counts: ReimportCounts;
	/** Backup filename (within the user's backup directory) when rows were touched. */
	backupFilename: string | null;
}

/** Internal resolved plan shared by preview and commit. */
interface ResolvedPlan {
	edits: {
		row: UpdateCsvRow;
		id: number;
		accountId: number;
		pre: PreStateRow;
		diffs: FieldDiff[];
	}[];
	inserts: { row: UpdateCsvRow; accountId: number }[];
	deletes: { row: UpdateCsvRow; id: number; pre: PreStateRow }[];
	skipped: number;
}

/** Pre-state snapshot of a row the import will touch (backup source). */
interface PreStateRow {
	id: number;
	accountId: number;
	accountSlug: string;
	txSlug: string;
	date: string;
	type: string;
	amountCents: number;
	description: string | null;
	categoryName: string | null;
}

// ---------------------------------------------------------------------------
// Parsing + field validation (no DB access)
// ---------------------------------------------------------------------------

/** Sanity cap matching the append import's per-file ceiling, scaled for exports. */
const MAX_UPDATE_ROWS = 20000;
const MAX_ROW_AMOUNT_POUNDS = 10_000_000;

export interface ParseUpdateResult {
	rows: UpdateCsvRow[];
	errors: string[];
	isBackup: boolean;
	backupTimestamp: string | null;
}

/**
 * Split a CSV line into fields, respecting quoted values. Doubled quotes
 * inside a quoted field decode to a single literal quote (RFC 4180), so
 * exported descriptions round-trip unchanged.
 */
function splitCsvLine(line: string): string[] {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === "," && !inQuotes) {
			fields.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}
	fields.push(current.trim());
	return fields;
}

/**
 * Parse a reimport file: header detection, backup-header detection, and
 * per-row field validation using the append-import validators. Collects all
 * errors with row numbers (file-level refusal) rather than stopping early.
 */
export function parseUpdateCsv(text: string): ParseUpdateResult {
	const lines = text.split(/\r?\n/).map((l) => l.trim());

	const errors: string[] = [];
	let isBackup = false;
	let backupTimestamp: string | null = null;

	// Strip comments / blank lines, detecting a backup header on the way
	const dataLines: string[] = [];
	for (const line of lines) {
		const stripped = line.trim();
		if (stripped === "") continue;
		if (stripped.startsWith("#")) {
			const backup = parseBackupHeaderLine(stripped);
			if (backup) {
				isBackup = true;
				backupTimestamp = backup.timestamp;
			}
			continue;
		}
		dataLines.push(stripped);
	}

	if (dataLines.length === 0) {
		return {
			rows: [],
			errors: ["No data rows found"],
			isBackup,
			backupTimestamp,
		};
	}

	const header = dataLines[0].toLowerCase();
	if (header !== TRANSACTION_CSV_HEADER) {
		return {
			rows: [],
			errors: [
				`Invalid header '${dataLines[0]}'. Expected '${TRANSACTION_CSV_HEADER}'`,
			],
			isBackup,
			backupTimestamp,
		};
	}

	const rows: UpdateCsvRow[] = [];
	const bodyLines = dataLines.slice(1);
	if (bodyLines.length > MAX_UPDATE_ROWS) {
		errors.push(
			`File has ${bodyLines.length} rows — the maximum is ${MAX_UPDATE_ROWS}`,
		);
	}

	for (let i = 0; i < bodyLines.length && rows.length <= MAX_UPDATE_ROWS; i++) {
		const rowNumber = i + 1;
		const fields = splitCsvLine(bodyLines[i]);
		if (fields.length !== 8) {
			errors.push(
				`Row ${rowNumber}: expected 8 fields but got ${fields.length}`,
			);
			continue;
		}

		const [
			accountSlug,
			idText,
			date,
			type,
			amountText,
			description,
			category,
			deleteText,
		] = fields;

		if (accountSlug === "") {
			errors.push(`Row ${rowNumber}: account_slug is required`);
			continue;
		}

		let id: number | null = null;
		if (idText !== "") {
			if (!/^\d+$/.test(idText)) {
				errors.push(`Row ${rowNumber}: id must be a number (got '${idText}')`);
				continue;
			}
			id = Number(idText);
		}

		let deleteFlag = false;
		if (deleteText !== "" && deleteText !== "0" && deleteText !== "false") {
			if (deleteText === "1" || deleteText === "true") {
				deleteFlag = true;
			} else {
				errors.push(
					`Row ${rowNumber}: _delete must be empty, 0 or 1 (got '${deleteText}')`,
				);
				continue;
			}
		}

		const amount = Number.parseFloat(amountText);
		if (Number.isNaN(amount)) {
			errors.push(
				`Row ${rowNumber}: amount must be a valid number (got '${amountText}')`,
			);
			continue;
		}
		if (!Number.isFinite(amount) || Math.abs(amount) > MAX_ROW_AMOUNT_POUNDS) {
			errors.push(`Row ${rowNumber}: amount exceeds the maximum allowed`);
			continue;
		}

		// Reuse the append-import validators for date/type/description/category
		const validationError = validateImportRows([
			{
				date,
				type: type as TransactionType,
				amount,
				description,
				category: category === "" ? undefined : category,
			},
		]);
		if (validationError) {
			// validateImportRows reports "Row 1:" for the single mapped row —
			// rewrite the prefix with the real file row number.
			errors.push(validationError.replace(/^Row 1:/, `Row ${rowNumber}:`));
			continue;
		}

		rows.push({
			rowNumber,
			accountSlug,
			id,
			date,
			type,
			amount,
			description,
			category,
			deleteFlag,
		});
	}

	return { rows, errors, isBackup, backupTimestamp };
}

// ---------------------------------------------------------------------------
// Plan resolution (preview)
// ---------------------------------------------------------------------------

function poundsToCents(pounds: number): number {
	return Math.round(pounds * 100);
}

function centsToPoundsString(cents: number): string {
	return (cents / 100).toFixed(2);
}

async function loadUserContext(userId: number) {
	const userAccounts = await db
		.select({
			id: accounts.id,
			slug: accounts.slug,
			name: accounts.name,
			closedAt: accounts.closedAt,
		})
		.from(accounts)
		.where(withUserFilter(userId, accounts));

	const categories = await db
		.select({
			id: spendingCategories.id,
			name: spendingCategories.name,
			key: spendingCategories.key,
		})
		.from(spendingCategories)
		.where(withUserFilter(userId, spendingCategories));

	const accountBySlug = new Map(userAccounts.map((a) => [a.slug, a]));
	const categoryByName = new Map<string, number>();
	for (const c of categories) {
		if (!categoryByName.has(c.name)) categoryByName.set(c.name, c.id);
		if (!categoryByName.has(c.key)) categoryByName.set(c.key, c.id);
	}

	return { accountBySlug, categoryByName };
}

/**
 * Resolve a parsed file into an exact plan against the user's live data, or
 * file-level refusal errors. Never writes.
 */
async function resolvePlan(
	userId: number,
	rows: UpdateCsvRow[],
	recovery: boolean,
): Promise<{ plan: ResolvedPlan } | { errors: string[] }> {
	const errors: string[] = [];
	const { accountBySlug, categoryByName } = await loadUserContext(userId);

	// Duplicate ids in one file are ambiguous — refuse.
	const seenIds = new Map<number, number>();
	for (const row of rows) {
		if (row.id === null) continue;
		const firstRow = seenIds.get(row.id);
		if (firstRow !== undefined) {
			errors.push(
				`Row ${row.rowNumber}: id ${row.id} appears again (first seen on row ${firstRow})`,
			);
		} else {
			seenIds.set(row.id, row.rowNumber);
		}
	}

	// Fetch the referenced transactions, scoped to the user's accounts (RLS —
	// a foreign id simply does not resolve).
	const idRows = rows.filter((r) => r.id !== null);
	const existing = new Map<number, PreStateRow>();
	if (idRows.length > 0) {
		const ids = [...new Set(idRows.map((r) => r.id as number))];
		const found = await db
			.select({
				id: accountTransactions.id,
				accountId: accountTransactions.accountId,
				txSlug: accountTransactions.slug,
				accountSlug: accounts.slug,
				transactionDate: accountTransactions.transactionDate,
				type: accountTransactions.type,
				amount: accountTransactions.amount,
				description: accountTransactions.description,
				categoryName: spendingCategories.name,
			})
			.from(accountTransactions)
			.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
			.leftJoin(
				spendingCategories,
				eq(accountTransactions.categoryId, spendingCategories.id),
			)
			.where(
				and(
					withUserFilter(userId, accounts),
					inArray(accountTransactions.id, ids),
				),
			);
		for (const row of found) {
			existing.set(row.id, {
				id: row.id,
				accountId: row.accountId,
				accountSlug: row.accountSlug,
				txSlug: row.txSlug,
				date: utcDateString(row.transactionDate),
				type: row.type,
				amountCents: row.amount,
				description: decryptTxDescription(userId, row.txSlug, row.description),
				categoryName: row.categoryName ?? null,
			});
		}
	}

	const plan: ResolvedPlan = {
		edits: [],
		inserts: [],
		deletes: [],
		skipped: 0,
	};

	for (const row of rows) {
		const account = accountBySlug.get(row.accountSlug);

		// No silent coercion: a non-empty category cell must resolve to one of
		// the user's categories (by name or key) or the file is refused.
		if (row.category !== "" && !categoryByName.has(row.category)) {
			errors.push(`Row ${row.rowNumber}: unknown category '${row.category}'`);
			continue;
		}

		if (row.id === null) {
			// Insert row: slug must resolve to the user's account; closed
			// accounts refuse inserts (parity with the append import and the
			// DB's own closed-account trigger).
			if (!account) {
				errors.push(
					`Row ${row.rowNumber}: unknown account_slug '${row.accountSlug}'`,
				);
				continue;
			}
			if (account.closedAt !== null) {
				errors.push(
					`Row ${row.rowNumber}: account '${row.accountSlug}' is closed — cannot insert`,
				);
				continue;
			}
			plan.inserts.push({ row, accountId: account.id });
			continue;
		}

		// Id row: must exist and belong to the user (unless recovery reinsert).
		const pre = existing.get(row.id);
		if (!pre) {
			if (recovery) {
				// Recovery reinsert with the original id.
				if (!account) {
					errors.push(
						`Row ${row.rowNumber}: unknown account_slug '${row.accountSlug}'`,
					);
					continue;
				}
				if (account.closedAt !== null) {
					errors.push(
						`Row ${row.rowNumber}: account '${row.accountSlug}' is closed — cannot restore rows into it`,
					);
					continue;
				}
				plan.inserts.push({ row, accountId: account.id });
				continue;
			}
			errors.push(
				`Row ${row.rowNumber}: unknown transaction id ${row.id} (it does not exist or belongs to another user)`,
			);
			continue;
		}

		// Id/slug consistency: the slug must name the row's actual account.
		if (row.accountSlug !== pre.accountSlug) {
			errors.push(
				`Row ${row.rowNumber}: id ${row.id} belongs to account '${pre.accountSlug}' but the row says '${row.accountSlug}'`,
			);
			continue;
		}

		if (!recovery && row.deleteFlag) {
			plan.deletes.push({ row, id: row.id, pre });
			continue;
		}

		// Edit (or recovery restore): compute field diffs vs the pre-state.
		const diffs: FieldDiff[] = [];
		if (pre.date !== row.date) {
			diffs.push({ field: "date", before: pre.date, after: row.date });
		}
		if (pre.type !== row.type) {
			diffs.push({ field: "type", before: pre.type, after: row.type });
		}
		if (pre.amountCents !== poundsToCents(row.amount)) {
			diffs.push({
				field: "amount",
				before: centsToPoundsString(pre.amountCents),
				after: row.amount.toFixed(2),
			});
		}
		if ((pre.description ?? "") !== row.description) {
			diffs.push({
				field: "description",
				before: pre.description ?? "",
				after: row.description,
			});
		}
		if ((pre.categoryName ?? "") !== row.category) {
			diffs.push({
				field: "category",
				before: pre.categoryName ?? "",
				after: row.category,
			});
		}

		if (diffs.length === 0) {
			plan.skipped++;
		} else {
			plan.edits.push({
				row,
				id: row.id,
				accountId: pre.accountId,
				pre,
				diffs,
			});
		}
	}

	if (errors.length > 0) return { errors };
	return { plan };
}

/**
 * Preview a reimport without writing: exact counts plus per-row field diffs.
 * Returns file-level refusal errors (with row numbers) when any row is
 * invalid — nothing changes in that case.
 */
export async function previewReimport(
	userId: number,
	text: string,
	opts: { recovery: boolean },
): Promise<PreviewResult> {
	const parsed = parseUpdateCsv(text);
	if (parsed.errors.length > 0) {
		return { ok: false, errors: parsed.errors, isBackup: parsed.isBackup };
	}
	if (parsed.rows.length === 0) {
		return {
			ok: false,
			errors: ["No data rows found"],
			isBackup: parsed.isBackup,
		};
	}

	const resolved = await resolvePlan(userId, parsed.rows, opts.recovery);
	if ("errors" in resolved) {
		return { ok: false, errors: resolved.errors, isBackup: parsed.isBackup };
	}

	const { plan } = resolved;
	return {
		ok: true,
		counts: {
			inserted: plan.inserts.length,
			edited: plan.edits.length,
			deleted: plan.deletes.length,
			skipped: plan.skipped,
		},
		edits: plan.edits.map((e) => ({
			rowNumber: e.row.rowNumber,
			id: e.id,
			accountSlug: e.row.accountSlug,
			diffs: e.diffs,
		})),
		inserts: plan.inserts.map((i) => ({
			rowNumber: i.row.rowNumber,
			accountSlug: i.row.accountSlug,
			date: i.row.date,
			type: i.row.type,
			amount: i.row.amount,
			description: i.row.description,
			category: i.row.category,
		})),
		deletes: plan.deletes.map((d) => ({
			rowNumber: d.row.rowNumber,
			id: d.id,
			accountSlug: d.pre.accountSlug,
			date: d.pre.date,
			type: d.pre.type,
			amount: d.pre.amountCents / 100,
			description: d.pre.description ?? "",
		})),
		isBackup: parsed.isBackup,
	};
}

// ---------------------------------------------------------------------------
// Backup writer
// ---------------------------------------------------------------------------

/**
 * Directory holding a user's reimport backups: `storage/backups/user-<id>/`.
 * Overridable (tests).
 */
export function backupDir(userId: number): string {
	const root =
		process.env.IMPORT_BACKUP_DIR ?? `${process.cwd()}/storage/backups`;
	return `${root}/user-${userId}`;
}

function backupFilename(now = new Date()): string {
	return `backup-${now.getTime()}-${nanoid(8)}.csv`;
}

const BACKUP_FILENAME_PATTERN = /^backup-\d{13}-[A-Za-z0-9_-]{8}\.csv$/;

/**
 * Write the timestamped "before" CSV for a plan's touched rows (edited rows'
 * old values + deleted rows' full pre-state; inserted rows have no
 * pre-state). Written BEFORE the commit transaction runs.
 */
async function writeBackup(
	userId: number,
	plan: ResolvedPlan,
): Promise<string | null> {
	const preRows = [
		...plan.edits.map((e) => e.pre),
		...plan.deletes.map((d) => d.pre),
	];
	if (preRows.length === 0) return null;

	const now = new Date();
	const scope = `${preRows.length} touched rows`;
	const csv = serializeTransactionCsv(
		preRows.map(
			(pre): TransactionCsvRow => ({
				accountSlug: pre.accountSlug,
				id: String(pre.id),
				date: pre.date,
				type: pre.type,
				amountCents: pre.amountCents,
				description: pre.description,
				category: pre.categoryName,
				deleteFlag: false,
			}),
		),
		[
			`${BACKUP_HEADER_PREFIX}${scope} at ${now.toISOString()}`,
			"# reimport in recovery mode (upsert by id) to restore these values",
		],
	);

	const dir = backupDir(userId);
	const { mkdir, writeFile } = await import("node:fs/promises");
	await mkdir(dir, { recursive: true });
	const filename = backupFilename(now);
	await writeFile(`${dir}/${filename}`, csv, "utf-8");
	return filename;
}

/**
 * Read a backup file for download. The filename must match the generated
 * pattern and live inside the user's own backup directory.
 */
export async function readBackupFile(
	userId: number,
	filename: string,
): Promise<string | null> {
	if (!BACKUP_FILENAME_PATTERN.test(filename)) return null;
	const dir = backupDir(userId);
	const { readFile } = await import("node:fs/promises");
	try {
		const content = await readFile(`${dir}/${filename}`, "utf-8");
		return content;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

/**
 * Commit a reimport: resolve the plan, write the pre-state backup, then
 * apply every insert/edit/delete in one DB transaction. Any failure rolls
 * the whole file back. Logs a batch summary (counts only, no personal data).
 */
export async function commitReimport(
	userId: number,
	text: string,
	opts: { recovery: boolean },
): Promise<CommitResult | { errors: string[] }> {
	const parsed = parseUpdateCsv(text);
	if (parsed.errors.length > 0 || parsed.rows.length === 0) {
		const errors =
			parsed.errors.length > 0 ? parsed.errors : ["No data rows found"];
		return { errors };
	}

	const { categoryByName } = await loadUserContext(userId);
	const resolved = await resolvePlan(userId, parsed.rows, opts.recovery);
	if ("errors" in resolved) {
		return { errors: resolved.errors };
	}
	const { plan } = resolved;

	const counts: ReimportCounts = {
		inserted: plan.inserts.length,
		edited: plan.edits.length,
		deleted: plan.deletes.length,
		skipped: plan.skipped,
	};

	if (counts.inserted === 0 && counts.edited === 0 && counts.deleted === 0) {
		return { counts, backupFilename: null };
	}

	// Backup first (pre-state of touched rows), then the atomic commit.
	const backupFilename = await writeBackup(userId, plan);

	db.transaction((tx) => {
		for (const del of plan.deletes) {
			tx.delete(accountTransactions)
				.where(eq(accountTransactions.id, del.id))
				.run();
		}
		for (const edit of plan.edits) {
			tx.update(accountTransactions)
				.set({
					type: edit.row.type as TransactionType,
					amount: poundsToCents(edit.row.amount),
					description: encryptTxDescription(
						userId,
						edit.pre.txSlug,
						edit.row.description === "" ? null : edit.row.description,
					),
					categoryId:
						edit.row.category === ""
							? null
							: (categoryByName.get(edit.row.category) ?? null),
					transactionDate: new Date(`${edit.row.date}T00:00:00.000Z`),
				})
				.where(eq(accountTransactions.id, edit.id))
				.run();
		}
		for (const ins of plan.inserts) {
			const slug = nanoid(21);
			tx.insert(accountTransactions)
				.values({
					// Recovery reinserts keep their original id; normal inserts
					// get a fresh one from the autoincrement column.
					...(ins.row.id !== null ? { id: ins.row.id } : {}),
					slug,
					accountId: ins.accountId,
					type: ins.row.type as TransactionType,
					amount: poundsToCents(ins.row.amount),
					description: encryptTxDescription(
						userId,
						slug,
						ins.row.description === "" ? null : ins.row.description,
					),
					categoryId:
						ins.row.category === ""
							? null
							: (categoryByName.get(ins.row.category) ?? null),
					transactionDate: new Date(`${ins.row.date}T00:00:00.000Z`),
				})
				.run();
		}
	});

	logInfo(
		"commitReimport",
		`Reimport committed: ${counts.inserted} inserted, ${counts.edited} edited, ${counts.deleted} deleted, ${counts.skipped} skipped`,
		{ recovery: opts.recovery },
	);

	return { counts, backupFilename };
}
