import { and, asc, eq, isNull } from "drizzle-orm";
import { withUserFilter } from "$lib/auth/row-security";
import { db } from "$lib/db/client";
import { accounts, spendingCategories } from "$lib/db/schema";
import { parseCsvDocument, serializeTransactionCsv } from "$lib/server/csv-format";
import type { TransactionCsvRow } from "$lib/server/csv-format";

/**
 * Bulk bank-history import (v3 B06 slice S5, R26).
 *
 * Takes a raw bank CSV (e.g. a Monzo transaction export going back
 * years), maps its columns onto the app's transaction shape, and emits
 * the app's own 8-column internal CSV — which then flows through the
 * EXISTING reimport engine (preview → backup → atomic commit, or the
 * background queue for big files). One pipeline, no parallel importer.
 *
 * Monzo personal export shape (verified 2026-10): columns
 * transaction_id, date, time, type, name, emoji, category, amount,
 * currency, local_amount, local_currency, notes, address, receipt,
 * description, category_split — dates dd/mm/yyyy, amounts signed
 * decimals. The preset maps date/name(+notes fallback)/amount/category.
 */

export interface ColumnMapping {
	/** 0-based indexes into the bank CSV's columns */
	dateCol: number;
	descriptionCol: number;
	amountCol: number;
	/** optional; -1 = none */
	categoryCol: number;
	/** "uk" = dd/mm/yyyy, "iso" = yyyy-mm-dd */
	dateFormat: "uk" | "iso";
}

export interface DetectedColumns {
	header: string[];
	rowCount: number;
	sample: string[][];
	mapping: ColumnMapping;
	/** true when the header matches the known Monzo layout */
	monzoPreset: boolean;
}

const MONZO_COLUMNS = [
	"transaction_id",
	"date",
	"time",
	"type",
	"name",
	"emoji",
	"category",
	"amount",
];

/** Normalise a header cell for matching: lowercase, spaces → underscores. */
function normaliseHeader(cell: string): string {
	return cell.trim().toLowerCase().replace(/\s+/g, "_");
}

function findColumn(
	header: string[],
	candidates: string[],
): number {
	for (const candidate of candidates) {
		const index = header.findIndex(
			(cell) => normaliseHeader(cell) === candidate,
		);
		if (index !== -1) return index;
	}
	// Partial match as a fallback (e.g. "Amount (GBP)")
	return header.findIndex((cell) =>
		candidates.some((candidate) => normaliseHeader(cell).includes(candidate)),
	);
}

function detectDateFormat(values: string[]): "uk" | "iso" {
	for (const value of values) {
		if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "iso";
		if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(value)) return "uk";
	}
	return "iso";
}

function toIsoDate(value: string, format: "uk" | "iso"): string | null {
	const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
	if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
	if (format === "uk") {
		const uk = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
		if (uk) {
			return `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
		}
	}
	return null;
}

/**
 * Read the uploaded bank CSV: header, row count, sample rows and a
 * best-effort column mapping (Monzo layout detected by header shape).
 */
export function analyzeBankCsv(text: string): DetectedColumns | { error: string } {
	const rows = parseCsvDocument(text);
	if (rows.length < 2) {
		return { error: "No data rows found (need a header row plus transactions)" };
	}
	const header = rows[0];
	if (header.length < 2) {
		return { error: "Header row must have at least date and amount columns" };
	}
	const body = rows.slice(1);
	if (body.length > 50_000) {
		return { error: `File has ${body.length} rows — split exports larger than 50,000` };
	}

	const normalised = header.map(normaliseHeader);
	const monzoPreset = MONZO_COLUMNS.every((column) =>
		normalised.includes(column),
	);

	const dateCol = monzoPreset
		? normalised.indexOf("date")
		: Math.max(
				findColumn(header, ["date", "transaction_date", "txn_date", "posted"]),
				0,
			);
	const amountCol = monzoPreset
		? normalised.indexOf("amount")
		: Math.max(
				findColumn(header, ["amount", "value", "amount_gbp"]),
				dateCol === 0 ? 1 : 0,
			);
	const descriptionCol = monzoPreset
		? normalised.indexOf("name")
		: Math.max(
				findColumn(header, [
					"description",
					"name",
					"counterparty",
					"merchant",
					"narrative",
					"details",
				]),
				0,
			);
	const categoryCol = monzoPreset
		? normalised.indexOf("category")
		: findColumn(header, ["category"]);

	const mapping: ColumnMapping = {
		dateCol,
		descriptionCol,
		amountCol,
		categoryCol,
		dateFormat: detectDateFormat(body.slice(0, 20).map((r) => r[dateCol] ?? "")),
	};

	return {
		header,
		rowCount: body.length,
		sample: body.slice(0, 5),
		mapping,
		monzoPreset,
	};
}

export interface TransformResult {
	/** App-format CSV ready for the reimport engine */
	csv: string;
	rows: number;
	skipped: { reason: string; count: number }[];
}

/**
 * Transform the bank CSV into the app's 8-column import format under the
 * target account. Amount sign drives the transaction type (positive →
 * deposit, negative → withdrawal); categories pass through only when the
 * user already has a category with that name. £0 rows are skipped
 * (nothing happened).
 */
export async function transformBankCsv(
	userId: number,
	accountSlug: string,
	text: string,
	mapping: ColumnMapping,
): Promise<TransformResult | { error: string }> {
	const account = await db.query.accounts.findFirst({
		where: and(
			withUserFilter(userId, accounts),
			eq(accounts.slug, accountSlug),
			isNull(accounts.deletedAt),
		),
		columns: { id: true, closedAt: true },
	});
	if (!account) return { error: `Unknown account '${accountSlug}'` };
	if (account.closedAt !== null) {
		return { error: "Account is closed — cannot import into it" };
	}

	const userCategories = await db.query.spendingCategories.findMany({
		where: and(
			eq(spendingCategories.userId, userId),
			isNull(spendingCategories.deletedAt),
		),
		columns: { name: true },
		orderBy: [asc(spendingCategories.name)],
	});
	const categoryNames = new Set(userCategories.map((c) => c.name));

	const rows = parseCsvDocument(text);
	if (rows.length < 2) return { error: "No data rows found" };
	const header = rows[0];
	const body = rows.slice(1);

	if (
		mapping.dateCol >= header.length ||
		mapping.amountCol >= header.length ||
		mapping.descriptionCol >= header.length ||
		(mapping.categoryCol >= header.length && mapping.categoryCol !== -1)
	) {
		return { error: "Column mapping refers to a column the file does not have" };
	}

	const skipped = new Map<string, number>();
	const out: TransactionCsvRow[] = [];
	for (const fields of body) {
		const date = toIsoDate(fields[mapping.dateCol] ?? "", mapping.dateFormat);
		if (!date) {
			skipped.set("unparseable date", (skipped.get("unparseable date") ?? 0) + 1);
			continue;
		}
		const amountText = (fields[mapping.amountCol] ?? "")
			.replace(/^[£]/, "")
			.replace(/,/g, "")
			.trim();
		const amount = Number.parseFloat(amountText);
		if (!Number.isFinite(amount) || amount === 0) {
			skipped.set("zero or invalid amount", (skipped.get("zero or invalid amount") ?? 0) + 1);
			continue;
		}
		const type = amount > 0 ? "deposit" : "withdrawal";
		const rawDescription = fields[mapping.descriptionCol] ?? "";
		const monzoNotes =
			mapping.categoryCol !== -1 &&
			header.some((c) => normaliseHeader(c) === "notes")
				? (fields[header.findIndex((c) => normaliseHeader(c) === "notes")] ?? "")
				: "";
		const description =
			rawDescription !== ""
				? rawDescription
				: monzoNotes !== ""
					? monzoNotes
					: type;
		const rawCategory =
			mapping.categoryCol !== -1 ? (fields[mapping.categoryCol] ?? "") : "";
		const category =
			rawCategory !== "" && categoryNames.has(rawCategory) ? rawCategory : "";

		out.push({
			accountSlug,
			id: "",
			date,
			type,
			amountCents: Math.round(amount * 100),
			description,
			category: category || null,
			deleteFlag: false,
		});
	}

	return {
		csv: serializeTransactionCsv(out),
		rows: out.length,
		skipped: [...skipped.entries()].map(([reason, count]) => ({
			reason,
			count,
		})),
	};
}
