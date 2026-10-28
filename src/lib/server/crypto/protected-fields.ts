import { decryptField, encryptField } from "./keyring";
import { EnvelopeError } from "./envelope";
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

/**
 * Placeholder for protected values that cannot be decrypted (tampered,
 * transposed, or written under a different DataKey — e.g. a stale seed).
 * Raw `v1|…` ciphertext must never reach the DOM: it leaks nothing useful,
 * reads as a visual bug, and shattered the transaction ledger (P0-2,
 * 2026-10-27 audit). Only EnvelopeError is masked; SealedError propagates
 * so the unlock ceremony still intercepts sealed sessions.
 */
const UNDECRYPTABLE = "[encrypted]";

function decryptResilient(
	userId: number,
	aad: ValueAAD,
	stored: string | null,
): string | null {
	if (stored === null) return null;
	try {
		// Legacy pre-migration plaintext passes through unchanged
		return decryptField(userId, aad, stored);
	} catch (err) {
		if (err instanceof EnvelopeError) return UNDECRYPTABLE;
		throw err;
	}
}

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
	return decryptResilient(
		userId,
		{ table: TX_TABLE, rowId: slug, column: "description" },
		stored,
	);
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
	return decryptResilient(
		userId,
		{ table: NOTE_TABLE, rowId: slug, column: "content" },
		stored,
	);
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
	return decryptResilient(
		userId,
		{ table: REVIEW_TABLE, rowId: slug, column: "notes" },
		stored,
	);
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
