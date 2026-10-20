import { decryptField, encryptField } from "./keyring";
import type { ValueAAD } from "./value-codec";

/**
 * Protected-column registry + per-column helpers (value layer, design D3).
 *
 * AAD binds (table, slug, column) — slugs are known before insert (nanoid),
 * stable across row updates, and unique per table, so ciphertext moved
 * between rows/columns/tables fails authentication.
 *
 * v1 coverage decision (design open question "column coverage"): free-text
 * personal columns — transaction descriptions and note bodies. Numeric
 * amounts remain file-layer-only: they feed SQL SUM aggregation across the
 * codebase, which column encryption cannot support; extending coverage is a
 * DataKey-stable change (wrap stays identical) tracked for a later change.
 */

const TX_TABLE = "account_transactions";
const NOTE_TABLE = "account_notes";
const REVIEW_TABLE = "monthly_reviews";

// --- account_transactions.description -------------------------------------

export function encryptTxDescription(
	userId: number,
	slug: string,
	description: string | null | undefined,
): string | null {
	if (description === null || description === undefined) return null;
	return encryptField(
		userId,
		{ table: TX_TABLE, rowId: slug, column: "description" },
		description,
	);
}

export function decryptTxDescription(
	userId: number,
	slug: string,
	stored: string | null,
): string | null {
	if (stored === null) return null;
	// Non-null for non-null input (legacy passthrough forwards the value)
	return decryptField(
		userId,
		{ table: TX_TABLE, rowId: slug, column: "description" },
		stored,
	) as string;
}

// --- account_notes.content --------------------------------------------------

export function encryptNoteContent(
	userId: number,
	slug: string,
	content: string,
): string {
	return encryptField(
		userId,
		{ table: NOTE_TABLE, rowId: slug, column: "content" },
		content,
	);
}

export function decryptNoteContent(
	userId: number,
	slug: string,
	stored: string | null,
): string | null {
	if (stored === null) return null;
	// decryptField returns non-null for non-null stored input (legacy
	// passthrough forwards the same value; GCM decrypt returns a string)
	return decryptField(
		userId,
		{ table: NOTE_TABLE, rowId: slug, column: "content" },
		stored,
	) as string;
}

// --- monthly_reviews.notes ---------------------------------------------------

export function encryptReviewNotes(
	userId: number,
	slug: string,
	notes: string,
): string {
	return encryptField(
		userId,
		{ table: REVIEW_TABLE, rowId: slug, column: "notes" },
		notes,
	);
}

export function decryptReviewNotes(
	userId: number,
	slug: string,
	stored: string | null,
): string | null {
	if (stored === null) return null;
	// Non-null for non-null input (legacy passthrough forwards the value)
	return decryptField(
		userId,
		{ table: REVIEW_TABLE, rowId: slug, column: "notes" },
		stored,
	) as string;
}

/** Tables + columns under value-layer encryption (migrator consumes this). */
export const PROTECTED_COLUMNS: ReadonlyArray<{
	table: string;
	column: string;
}> = [
	{ table: TX_TABLE, column: "description" },
	{ table: NOTE_TABLE, column: "content" },
	{ table: REVIEW_TABLE, column: "notes" },
];

export type { ValueAAD };
