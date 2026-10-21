import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "$lib/db/client";
import { runMigrations } from "$lib/db/migrate";
import {
	accountNotes,
	accountTransactions,
	monthlyReviews,
} from "$lib/db/schema";
import { sealKeyring } from "$lib/server/crypto/keyring";
import {
	decryptNoteContent,
	decryptReviewNotes,
	decryptTxDescription,
} from "$lib/server/crypto/protected-fields";
import { ensureAdminUser } from "../../scripts/seed/lib/user";
import { seedStandard } from "../../scripts/seed/modes/standard";

/**
 * data-layer-integrity task 1.4 (at-rest audit as a test): a fresh seeded
 * database contains ZERO plaintext protected values — every
 * account_transactions.description, account_notes.content and
 * monthly_reviews.notes is `v1|` ciphertext decryptable under the seeded
 * user's DataKey. Task 1.3: re-seeding an EXISTING user unwraps the dev
 * password slot and re-writes encrypted (wipe + re-seed).
 */

const DB_PATH = path.resolve(
	`storage/test-seed-encrypt-${Date.now()}-${process.pid}.db`,
);
const db = createDb(DB_PATH);
let seededUserId = 0;

/** At-rest audit shape: every non-null protected value is v1| ciphertext. */
async function auditProtectedColumns(): Promise<{
	txTotal: number;
	txEncrypted: number;
	noteTotal: number;
	noteEncrypted: number;
	reviewTotal: number;
	reviewEncrypted: number;
}> {
	const txRows = await db
		.select({
			description: accountTransactions.description,
		})
		.from(accountTransactions);
	const noteRows = await db
		.select({ content: accountNotes.content })
		.from(accountNotes);
	const reviewRows = await db
		.select({ notes: monthlyReviews.notes })
		.from(monthlyReviews);

	const isCipher = (v: string | null) => v?.startsWith("v1|");
	return {
		txTotal: txRows.filter((r) => r.description !== null).length,
		txEncrypted: txRows.filter((r) => isCipher(r.description)).length,
		noteTotal: noteRows.filter((r) => r.content !== null).length,
		noteEncrypted: noteRows.filter((r) => isCipher(r.content)).length,
		reviewTotal: reviewRows.filter((r) => r.notes !== null).length,
		reviewEncrypted: reviewRows.filter((r) => isCipher(r.notes)).length,
	};
}

beforeAll(async () => {
	await runMigrations(db);
	seededUserId = await ensureAdminUser(db);
});

afterAll(async () => {
	sealKeyring("seed-encryption-test-teardown");
	// Throwaway DB file — close and delete it wholesale (row-by-row
	// deletes would need the full child-first wipe ordering).
	db.$client.close();
	if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
});

describe("seed encryption (fresh seed)", () => {
	it("seeds the standard fixtures with 0 plaintext protected values", async () => {
		await seedStandard(db, seededUserId);

		const audit = await auditProtectedColumns();
		// The fixtures genuinely exercise all three protected columns
		expect(audit.txTotal).toBeGreaterThan(0);
		expect(audit.noteTotal).toBeGreaterThan(0);
		expect(audit.reviewTotal).toBeGreaterThan(0);
		// Nothing at rest is plaintext
		expect(audit.txEncrypted).toBe(audit.txTotal);
		expect(audit.noteEncrypted).toBe(audit.noteTotal);
		expect(audit.reviewEncrypted).toBe(audit.reviewTotal);
	}, 120_000);

	it("stored ciphertext decrypts under the seeded user's DataKey (AAD intact)", async () => {
		const rows = await db
			.select({
				slug: accountTransactions.slug,
				description: accountTransactions.description,
			})
			.from(accountTransactions)
			.limit(200);
		const cipherRow = rows.find((r) => r.description?.startsWith("v1|"));
		expect(cipherRow).toBeDefined();
		if (!cipherRow) return;
		const plain = decryptTxDescription(
			seededUserId,
			cipherRow.slug,
			cipherRow.description,
		);
		expect(plain).not.toMatch(/^v1\|/);
		expect(typeof plain).toBe("string");

		const noteRows = await db
			.select({ slug: accountNotes.slug, content: accountNotes.content })
			.from(accountNotes)
			.limit(5);
		const note = noteRows.find((r) => r.content?.startsWith("v1|"));
		expect(note).toBeDefined();
		if (note) {
			expect(
				decryptNoteContent(seededUserId, note.slug, note.content),
			).not.toMatch(/^v1\|/);
		}

		const reviewRows = await db
			.select({ slug: monthlyReviews.slug, notes: monthlyReviews.notes })
			.from(monthlyReviews)
			.limit(10);
		const review = reviewRows.find((r) => r.notes?.startsWith("v1|"));
		expect(review).toBeDefined();
		if (review) {
			expect(
				decryptReviewNotes(seededUserId, review.slug, review.notes),
			).not.toMatch(/^v1\|/);
		}
	});
});

describe("re-seed of an EXISTING seeded user (task 1.3)", () => {
	it("unwraps the dev password slot and re-seeds encrypted", async () => {
		// Existing admin: ensureAdminUser must unwrap with the dev
		// password (no new slots) and unlock the SAME DataKey.
		const againUserId = await ensureAdminUser(db);
		expect(againUserId).toBe(seededUserId);

		await seedStandard(db, againUserId);

		const audit = await auditProtectedColumns();
		expect(audit.txTotal).toBeGreaterThan(0);
		expect(audit.txEncrypted).toBe(audit.txTotal);
		expect(audit.noteEncrypted).toBe(audit.noteTotal);
		expect(audit.reviewEncrypted).toBe(audit.reviewTotal);

		// Review rows stay unique per (user, month) after re-seed —
		// the wipe clears monthly_reviews before fixtures re-insert.
		const reviewRows = await db
			.select({ yearMonth: monthlyReviews.yearMonth })
			.from(monthlyReviews);
		const months = reviewRows.map((r) => r.yearMonth);
		expect(new Set(months).size).toBe(months.length);
	}, 120_000);
});
