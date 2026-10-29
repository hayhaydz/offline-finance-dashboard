import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { expensesHistory, incomeHistory } from "$lib/db/schema";
import {
	BACKUP_HEADER_PREFIX,
	centsToPoundsString,
	csvEscape,
} from "$lib/server/csv-format";
import { backupDir } from "$lib/server/imports-update";
import { logInfo } from "$lib/server/logger";

/**
 * History CSV engine (v3 B06 slice S3, R23) — month-keyed history
 * (expenses + income) export/reimport through the same Matrixify-style
 * round-trip as the transaction engine.
 *
 * File shape (4 columns; `#` comments ignored):
 *
 *   month,amount,note,_delete
 *   2026-01,2000.00,"note text",
 *   2026-02,0.00,,1
 *
 * Semantics — upsert by month (the table's natural key is
 * (userId, month), so there is no id column to track):
 *   - `_delete=1`   → remove the month (it becomes unknown, not £0)
 *   - month absent  → insert (month becomes known)
 *   - month present → edit fields that differ; identical → skipped
 *
 * Decision (recorded v3): deleting a month that does not exist is a
 * counted skip, not a refusal — DELETE-if-exists is idempotent and the
 * month format is validated, so the typo surface the transaction engine's
 * unknown-id refusal protects against does not apply.
 *
 * Backups mirror the transaction engine's contract (timestamped pre-state
 * CSV in the user's backup directory) but are plaintext: history notes are
 * stored unencrypted in the DB, so this matches the existing protection
 * level for this data. A backup file is itself a valid import file for the
 * same kind (its `# kind:` comment makes the round-trip direct).
 */

export type HistoryKind = "expenses" | "income";

export const HISTORY_KINDS: readonly HistoryKind[] = ["expenses", "income"];

export const HISTORY_CSV_HEADER = "month,amount,note,_delete";

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_HISTORY_ROWS = 5000;
const MAX_ROW_AMOUNT_POUNDS = 10_000_000;
const MAX_NOTE_LENGTH = 200;

const KIND_COMMENT_PREFIX = "# kind: ";

function kindTable(kind: HistoryKind) {
	return kind === "expenses" ? expensesHistory : incomeHistory;
}

function amountColumn(kind: HistoryKind) {
	return kind === "expenses"
		? expensesHistory.monthlyExpensesInCents
		: incomeHistory.grossIncomeInCents;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface HistoryCsvRow {
	rowNumber: number;
	month: string;
	amount: number; // pounds, >= 0
	note: string;
	deleteFlag: boolean;
}

export interface ParseHistoryResult {
	rows: HistoryCsvRow[];
	errors: string[];
	kind: HistoryKind | null;
	isBackup: boolean;
}

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

export function parseHistoryCsv(text: string): ParseHistoryResult {
	const lines = text.split(/\r?\n/).map((l) => l.trim());

	const errors: string[] = [];
	let kind: HistoryKind | null = null;
	let isBackup = false;
	const dataLines: string[] = [];
	for (const line of lines) {
		if (line === "") continue;
		if (line.startsWith("#")) {
			if (line.startsWith(BACKUP_HEADER_PREFIX)) isBackup = true;
			if (line.startsWith(KIND_COMMENT_PREFIX)) {
				const value = line.slice(KIND_COMMENT_PREFIX.length).trim();
				if ((HISTORY_KINDS as readonly string[]).includes(value)) {
					kind = value as HistoryKind;
				} else {
					errors.push(`Unknown history kind '${value}'`);
				}
			}
			continue;
		}
		dataLines.push(line);
	}

	if (dataLines.length === 0) {
		return { rows: [], errors: [...errors, "No data rows found"], kind, isBackup };
	}

	if (dataLines[0].toLowerCase() !== HISTORY_CSV_HEADER) {
		return {
			rows: [],
			errors: [
				`Invalid header '${dataLines[0]}'. Expected '${HISTORY_CSV_HEADER}'`,
			],
			kind,
			isBackup,
		};
	}

	const rows: HistoryCsvRow[] = [];
	const bodyLines = dataLines.slice(1);
	if (bodyLines.length > MAX_HISTORY_ROWS) {
		errors.push(
			`File has ${bodyLines.length} rows — the maximum is ${MAX_HISTORY_ROWS}`,
		);
	}

	for (let i = 0; i < bodyLines.length && rows.length <= MAX_HISTORY_ROWS; i++) {
		const rowNumber = i + 1;
		const fields = splitCsvLine(bodyLines[i]);
		if (fields.length !== 4) {
			errors.push(
				`Row ${rowNumber}: expected 4 fields but got ${fields.length}`,
			);
			continue;
		}
		const [month, amountText, note, deleteText] = fields;

		if (!MONTH_REGEX.test(month)) {
			errors.push(`Row ${rowNumber}: month must be YYYY-MM (got '${month}')`);
			continue;
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
		if (Number.isNaN(amount) || !Number.isFinite(amount) || amount < 0) {
			errors.push(
				`Row ${rowNumber}: amount must be a number >= 0 (got '${amountText}')`,
			);
			continue;
		}
		if (amount > MAX_ROW_AMOUNT_POUNDS) {
			errors.push(`Row ${rowNumber}: amount exceeds the maximum allowed`);
			continue;
		}
		if (note.length > MAX_NOTE_LENGTH) {
			errors.push(
				`Row ${rowNumber}: note must be ${MAX_NOTE_LENGTH} characters or less`,
			);
			continue;
		}

		rows.push({ rowNumber, month, amount, note, deleteFlag });
	}

	return { rows, errors, kind, isBackup };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface HistoryExportMeta {
	kind: HistoryKind;
	rowCount: number;
	firstMonth: string | null;
	lastMonth: string | null;
	exportedAt: string;
}

export async function buildHistoryCsv(
	userId: number,
	kind: HistoryKind,
): Promise<{ csv: string; meta: HistoryExportMeta }> {
	const table = kindTable(kind);
	const column = amountColumn(kind);
	const rows = await db
		.select({ month: table.month, amount: column, note: table.note })
		.from(table)
		.where(withUserFilter(userId, table))
		.orderBy(asc(table.month));

	const exportedAt = new Date().toISOString();
	const comments = [
		`# offline-finance history export — ${exportedAt}`,
		`${KIND_COMMENT_PREFIX}${kind}`,
		`# rows: ${rows.length}${
			rows.length > 0
				? ` · months ${rows[0].month} → ${rows[rows.length - 1].month}`
				: ""
		}`,
		"# reimport: edit amount/note to update a month, _delete=1 removes it",
	];

	const lines = [...comments, HISTORY_CSV_HEADER];
	for (const row of rows) {
		lines.push(
			[
				row.month,
				centsToPoundsString(row.amount),
				csvEscape(row.note ?? ""),
				"",
			].join(","),
		);
	}

	return {
		csv: `${lines.join("\n")}\n`,
		meta: {
			kind,
			rowCount: rows.length,
			firstMonth: rows[0]?.month ?? null,
			lastMonth: rows.length > 0 ? rows[rows.length - 1].month : null,
			exportedAt,
		},
	};
}

export function historyExportFilename(
	kind: HistoryKind,
	now = new Date(),
): string {
	const stamp = now
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");
	return `${kind}-history-${stamp}.csv`;
}

// ---------------------------------------------------------------------------
// Plan (preview) + commit
// ---------------------------------------------------------------------------

export interface HistoryFieldDiff {
	field: "amount" | "note";
	before: string;
	after: string;
}

export interface HistoryPlanRow {
	rowNumber: number;
	month: string;
	diffs: HistoryFieldDiff[];
}

export interface HistoryDeleteRow {
	rowNumber: number;
	month: string;
	amount: number; // pounds
	note: string;
}

export interface HistoryCounts {
	inserted: number;
	edited: number;
	deleted: number;
	skipped: number;
}

export type HistoryPreviewResult =
	| {
			ok: true;
			counts: HistoryCounts;
			edits: HistoryPlanRow[];
			inserts: { rowNumber: number; month: string; amount: number; note: string }[];
			deletes: HistoryDeleteRow[];
			isBackup: boolean;
	  }
	| { ok: false; errors: string[]; isBackup: boolean };

interface ResolvedHistoryPlan {
	inserts: { row: HistoryCsvRow }[];
	updates: { row: HistoryCsvRow; diffs: HistoryFieldDiff[] }[];
	deletes: { row: HistoryCsvRow; pre: { amountCents: number; note: string | null } }[];
	skipped: number;
	backupRows: { month: string; amountCents: number; note: string | null }[];
}

async function resolveHistoryPlan(
	userId: number,
	kind: HistoryKind,
	rows: HistoryCsvRow[],
): Promise<{ plan: ResolvedHistoryPlan } | { errors: string[] }> {
	const errors: string[] = [];

	// Duplicate months in one file are ambiguous — refuse.
	const seen = new Map<string, number>();
	for (const row of rows) {
		const first = seen.get(row.month);
		if (first !== undefined) {
			errors.push(
				`Row ${row.rowNumber}: month ${row.month} appears again (first seen on row ${first})`,
			);
		} else {
			seen.set(row.month, row.rowNumber);
		}
	}

	const table = kindTable(kind);
	const column = amountColumn(kind);
	const existing = new Map<
		string,
		{ amountCents: number; note: string | null }
	>();
	if (rows.length > 0) {
		const found = await db
			.select({ month: table.month, amount: column, note: table.note })
			.from(table)
			.where(
				and(
					withUserFilter(userId, table),
					inArray(
						table.month,
						rows.map((r) => r.month),
					),
				),
			);
		for (const row of found) {
			existing.set(row.month, { amountCents: row.amount, note: row.note });
		}
	}

	const plan: ResolvedHistoryPlan = {
		inserts: [],
		updates: [],
		deletes: [],
		skipped: 0,
		backupRows: [],
	};

	for (const row of rows) {
		const pre = existing.get(row.month);

		if (row.deleteFlag) {
			if (!pre) {
				plan.skipped++; // DELETE-if-exists is idempotent
				continue;
			}
			plan.deletes.push({ row, pre });
			plan.backupRows.push({
				month: row.month,
				amountCents: pre.amountCents,
				note: pre.note,
			});
			continue;
		}

		if (!pre) {
			plan.inserts.push({ row });
			continue;
		}

		const diffs: HistoryFieldDiff[] = [];
		if (pre.amountCents !== Math.round(row.amount * 100)) {
			diffs.push({
				field: "amount",
				before: centsToPoundsString(pre.amountCents),
				after: row.amount.toFixed(2),
			});
		}
		if ((pre.note ?? "") !== row.note) {
			diffs.push({
				field: "note",
				before: pre.note ?? "",
				after: row.note,
			});
		}
		if (diffs.length === 0) {
			plan.skipped++;
		} else {
			plan.updates.push({ row, diffs });
			plan.backupRows.push({
				month: row.month,
				amountCents: pre.amountCents,
				note: pre.note,
			});
		}
	}

	if (errors.length > 0) return { errors };
	return { plan };
}

function validateKind(
	parsed: ParseHistoryResult,
	kind: HistoryKind,
): string | null {
	if (parsed.kind === null) return null; // no kind comment: not required
	if (parsed.kind !== kind) {
		return `File says kind '${parsed.kind}' but this import is for '${kind}'`;
	}
	return null;
}

export async function previewHistoryImport(
	userId: number,
	kind: HistoryKind,
	text: string,
): Promise<HistoryPreviewResult> {
	const parsed = parseHistoryCsv(text);
	const kindError = validateKind(parsed, kind);
	if (kindError) {
		return { ok: false, errors: [kindError], isBackup: parsed.isBackup };
	}
	if (parsed.errors.length > 0 || parsed.rows.length === 0) {
		return {
			ok: false,
			errors: parsed.errors.length > 0 ? parsed.errors : ["No data rows found"],
			isBackup: parsed.isBackup,
		};
	}

	const resolved = await resolveHistoryPlan(userId, kind, parsed.rows);
	if ("errors" in resolved) {
		return { ok: false, errors: resolved.errors, isBackup: parsed.isBackup };
	}
	const { plan } = resolved;

	return {
		ok: true,
		counts: {
			inserted: plan.inserts.length,
			edited: plan.updates.length,
			deleted: plan.deletes.length,
			skipped: plan.skipped,
		},
		edits: plan.updates.map((u) => ({
			rowNumber: u.row.rowNumber,
			month: u.row.month,
			diffs: u.diffs,
		})),
		inserts: plan.inserts.map((i) => ({
			rowNumber: i.row.rowNumber,
			month: i.row.month,
			amount: i.row.amount,
			note: i.row.note,
		})),
		deletes: plan.deletes.map((d) => ({
			rowNumber: d.row.rowNumber,
			month: d.row.month,
			amount: d.pre.amountCents / 100,
			note: d.pre.note ?? "",
		})),
		isBackup: parsed.isBackup,
	};
}

// ---------------------------------------------------------------------------
// Backup + commit
// ---------------------------------------------------------------------------

/**
 * Plaintext pre-state backup (see module doc for the protection-level
 * rationale). Same directory + naming as transaction backups, so the
 * existing download endpoint serves these files unchanged.
 */
async function writeHistoryBackup(
	userId: number,
	kind: HistoryKind,
	plan: ResolvedHistoryPlan,
): Promise<string | null> {
	if (plan.backupRows.length === 0) return null;

	const now = new Date();
	const lines = [
		`${BACKUP_HEADER_PREFIX}${plan.backupRows.length} touched ${kind} months at ${now.toISOString()}`,
		`${KIND_COMMENT_PREFIX}${kind}`,
		HISTORY_CSV_HEADER,
		...plan.backupRows.map((row) =>
			[
				row.month,
				centsToPoundsString(row.amountCents),
				csvEscape(row.note ?? ""),
				"",
			].join(","),
		),
	];

	const { mkdir, writeFile } = await import("node:fs/promises");
	const dir = backupDir(userId);
	await mkdir(dir, { recursive: true });
	const filename = `backup-${now.getTime()}-${nanoid(8)}.csv`;
	await writeFile(`${dir}/${filename}`, `${lines.join("\n")}\n`, "utf-8");
	return filename;
}

export type HistoryCommitResult =
	| { ok: true; counts: HistoryCounts; backupFilename: string | null }
	| { ok: false; errors: string[] };

export async function commitHistoryImport(
	userId: number,
	kind: HistoryKind,
	text: string,
): Promise<HistoryCommitResult> {
	const parsed = parseHistoryCsv(text);
	const kindError = validateKind(parsed, kind);
	if (kindError) return { ok: false, errors: [kindError] };
	if (parsed.errors.length > 0 || parsed.rows.length === 0) {
		return {
			ok: false,
			errors: parsed.errors.length > 0 ? parsed.errors : ["No data rows found"],
		};
	}

	const resolved = await resolveHistoryPlan(userId, kind, parsed.rows);
	if ("errors" in resolved) {
		return { ok: false, errors: resolved.errors };
	}
	const { plan } = resolved;

	const counts: HistoryCounts = {
		inserted: plan.inserts.length,
		edited: plan.updates.length,
		deleted: plan.deletes.length,
		skipped: plan.skipped,
	};
	if (
		counts.inserted === 0 &&
		counts.edited === 0 &&
		counts.deleted === 0
	) {
		return { ok: true, counts, backupFilename: null };
	}

	const backupFilename = await writeHistoryBackup(userId, kind, plan);

	const table = kindTable(kind);
	db.transaction((tx) => {
		for (const del of plan.deletes) {
			tx.delete(table)
				.where(
					and(
						withUserFilter(userId, table),
						eq(table.month, del.row.month),
					),
				)
				.run();
		}
		// Inserts + updates share the upsert (natural key userId+month).
		// Per-row upserts: a batched onConflictDoUpdate cannot express
		// per-row amounts in its SET clause.
		const upserts = [
			...plan.inserts.map((i) => i.row),
			...plan.updates.map((u) => u.row),
		];
		for (const row of upserts) {
			const cents = Math.round(row.amount * 100);
			const note = row.note === "" ? null : row.note;
			const updatedAt = new Date();
			if (kind === "expenses") {
				tx.insert(expensesHistory)
					.values({
						userId,
						month: row.month,
						monthlyExpensesInCents: cents,
						note,
						updatedAt,
					})
					.onConflictDoUpdate({
						target: [expensesHistory.userId, expensesHistory.month],
						set: { monthlyExpensesInCents: cents, note, updatedAt },
					})
					.run();
			} else {
				tx.insert(incomeHistory)
					.values({
						userId,
						month: row.month,
						grossIncomeInCents: cents,
						note,
						updatedAt,
					})
					.onConflictDoUpdate({
						target: [incomeHistory.userId, incomeHistory.month],
						set: { grossIncomeInCents: cents, note, updatedAt },
					})
					.run();
			}
		}
	});

	logInfo(
		"commitHistoryImport",
		`History import committed (${kind}): ${counts.inserted} inserted, ${counts.edited} edited, ${counts.deleted} deleted, ${counts.skipped} skipped`,
	);

	return { ok: true, counts, backupFilename };
}
