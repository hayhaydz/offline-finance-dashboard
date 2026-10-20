import { eq } from "drizzle-orm";
import {
	accountNotes,
	accounts,
	accountTransactions,
	credentialSlots,
	monthlyReviews,
} from "$lib/db/schema";
import { logInfo } from "$lib/server/logger";
import type { KeyringDb } from "./enroll";
import { enrollRecoverySlot, getActiveSlots } from "./enroll";
import { generateDataKey, generateSlotId, wrapSlot } from "./envelope";
import { requireDataKey, unlockKeyring } from "./keyring";
import { derivePasswordSlotKey, generateSlotSalt } from "./slot-keys";
import {
	decryptValue,
	encryptValue,
	isEncryptedValue,
	type ValueAAD,
} from "./value-codec";

/**
 * One-shot envelope migration (task 5.1) + full DataKey rotation (task 4.4).
 *
 * NOTE on transactions: better-sqlite3 requires SYNCHRONOUS transaction
 * bodies. All Argon2id key-derivation work happens BEFORE the transaction
 * opens; inside it only sync drizzle calls (.all() / .run()) execute.
 */

export interface TableMigrationResult {
	table: string;
	rowsScanned: number;
	rowsEncrypted: number;
}

export interface EnvelopeMigrationResult {
	tables: TableMigrationResult[];
	slotId: string | null;
}

interface ProtectedTable {
	table: string;
	column: "description" | "content" | "notes";
	/** Sync read of the USER'S (slug, value) pairs — .all(), not await. */
	readAll: (
		db: KeyringDb,
		userId: number,
	) => Array<{ slug: string; value: string | null }>;
	/** Sync update of one row's protected column — .run(), not await. */
	updateOne: (db: KeyringDb, slug: string, encrypted: string) => void;
}

// Row scope: every read is USER-scoped (directly or via the owning account)
// so migration/rotation never touches — or encrypts under the wrong DataKey —
// another user's rows, even in a shared database.
const PROTECTED_TABLES: ProtectedTable[] = [
	{
		table: "account_transactions",
		column: "description",
		readAll: (db, userId) =>
			db
				.select({
					slug: accountTransactions.slug,
					value: accountTransactions.description,
				})
				.from(accountTransactions)
				.innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
				.where(eq(accounts.userId, userId))
				.all(),
		updateOne: (db, slug, encrypted) => {
			db.update(accountTransactions)
				.set({ description: encrypted })
				.where(eq(accountTransactions.slug, slug))
				.run();
		},
	},
	{
		table: "account_notes",
		column: "content",
		readAll: (db, userId) =>
			db
				.select({ slug: accountNotes.slug, value: accountNotes.content })
				.from(accountNotes)
				.innerJoin(accounts, eq(accountNotes.accountId, accounts.id))
				.where(eq(accounts.userId, userId))
				.all(),
		updateOne: (db, slug, encrypted) => {
			db.update(accountNotes)
				.set({ content: encrypted })
				.where(eq(accountNotes.slug, slug))
				.run();
		},
	},
	{
		table: "monthly_reviews",
		column: "notes",
		readAll: (db, userId) =>
			db
				.select({ slug: monthlyReviews.slug, value: monthlyReviews.notes })
				.from(monthlyReviews)
				.where(eq(monthlyReviews.userId, userId))
				.all(),
		updateOne: (db, slug, encrypted) => {
			db.update(monthlyReviews)
				.set({ notes: encrypted })
				.where(eq(monthlyReviews.slug, slug))
				.run();
		},
	},
];

/**
 * Migrate a legacy (pre-envelope) user. The caller MUST have verified the
 * password against the Argon2id auth hash (login flow) before invoking.
 * Recovery-paper enrollment happens in the SAME session afterwards
 * (spec recovery-credentials: "Migration cannot skip recovery enrollment").
 *
 * Atomic: slot creation and every table's encryption run in ONE synchronous
 * transaction — a mid-migration failure rolls back completely, so retry
 * starts clean (which also makes each table's changes transactional, per
 * spec).
 */
export async function migrateUserEnvelope(
	db: KeyringDb,
	params: {
		userId: number;
		password: string;
		passwordSalt: string;
	},
): Promise<EnvelopeMigrationResult> {
	const existing = await getActiveSlots(db, params.userId, "password");
	if (existing.length > 0) {
		// Fully migrated by construction (single-transaction design).
		return { tables: [], slotId: null };
	}

	// Crypto BEFORE the transaction (Argon2id + GCM are async/sync-mixed):
	// generate the DataKey, derive the password slot key, wrap.
	const dataKey = generateDataKey();
	const slotId = generateSlotId();
	const slotKey = await derivePasswordSlotKey(
		params.password,
		params.passwordSalt,
	);
	const wrapped = wrapSlot(dataKey, slotKey, {
		kind: "password",
		userId: params.userId,
		slotId,
	});

	const results: TableMigrationResult[] = [];

	db.transaction((tx) => {
		// 1. Envelope creation: password slot row.
		tx.insert(credentialSlots)
			.values({
				slotId,
				userId: params.userId,
				kind: "password",
				wrappedKey: wrapped.wrappedKey,
				iv: wrapped.iv,
				metadata: { label: "Password" },
				createdAt: new Date(),
			})
			.run();

		// 2. Encrypt protected columns with verified counts before commit.
		for (const t of PROTECTED_TABLES) {
			const rows = t.readAll(tx as unknown as KeyringDb, params.userId);
			let encrypted = 0;
			for (const row of rows) {
				if (row.value === null || isEncryptedValue(row.value)) continue;
				const aad: ValueAAD = {
					table: t.table,
					rowId: row.slug,
					column: t.column,
				};
				t.updateOne(
					tx as unknown as KeyringDb,
					row.slug,
					encryptValue(dataKey, row.value, aad),
				);
				encrypted++;
			}
			results.push({
				table: t.table,
				rowsScanned: rows.length,
				rowsEncrypted: encrypted,
			});
		}
	});

	logInfo("envelope-migrate", "Envelope migration complete", {
		userId: params.userId,
		tables: results,
	});

	return { tables: results, slotId };
}

/**
 * Full DataKey rotation (task 4.4) — reserved for recovery-paper compromise.
 * Re-encrypts all protected data under a fresh DataKey, re-wraps every slot,
 * and issues a NEW recovery passphrase (shown once by the caller). Requires
 * a fully unlocked keyring (settings action behind full unlock).
 */
export async function rotateUserEnvelope(
	db: KeyringDb,
	params: {
		userId: number;
		password: string;
	},
): Promise<{ passphrase: string }> {
	const oldDataKey = requireDataKey(params.userId);
	const newDataKey = generateDataKey();

	// Re-encrypt every protected value under the new DataKey — one
	// synchronous transaction per table (GCM work is sync node:crypto).
	for (const t of PROTECTED_TABLES) {
		db.transaction((tx) => {
			const rows = t.readAll(tx as unknown as KeyringDb, params.userId);
			for (const row of rows) {
				if (row.value === null || !isEncryptedValue(row.value)) continue;
				const aad: ValueAAD = {
					table: t.table,
					rowId: row.slug,
					column: t.column,
				};
				const plaintext = decryptValue(oldDataKey, row.value, aad);
				t.updateOne(
					tx as unknown as KeyringDb,
					row.slug,
					encryptValue(newDataKey, plaintext, aad),
				);
			}
		});
	}

	// Re-wrap the password slot over the NEW DataKey (same password, fresh
	// salt). Crypto first, then row updates.
	const newSalt = generateSlotSalt();
	const { revokeSlot } = await import("./enroll");
	const passwordSlots = await getActiveSlots(db, params.userId, "password");
	if (passwordSlots.length > 0) {
		const newSlotKey = await derivePasswordSlotKey(params.password, newSalt);
		const slot = passwordSlots[0];
		const rewrapped = wrapSlot(newDataKey, newSlotKey, {
			kind: "password",
			userId: params.userId,
			slotId: slot.slotId,
		});
		await db
			.update(credentialSlots)
			.set({ wrappedKey: rewrapped.wrappedKey, iv: rewrapped.iv })
			.where(eq(credentialSlots.slotId, slot.slotId));
		// users.passwordSalt must track the slot salt for future derivations.
		const { users } = await import("$lib/db/schema");
		await db
			.update(users)
			.set({ passwordSalt: newSalt, updatedAt: new Date() })
			.where(eq(users.id, params.userId));
	}

	// Recovery slot: revoke the (possibly compromised) paper and enroll a
	// fresh passphrase + salt over the NEW key.
	const recoverySlots = await getActiveSlots(
		db,
		params.userId,
		"recovery-passphrase",
	);
	for (const slot of recoverySlots) {
		await revokeSlot(db, params.userId, slot.slotId);
	}
	const { passphrase } = await enrollRecoverySlot(db, {
		userId: params.userId,
		dataKey: newDataKey,
	});

	// 4. NOTE(webauthn-prf): device slots cannot be re-wrapped server-side
	//    (their wrapping key never leaves the device). When L2 lands, this
	//    step must revoke device slots and force re-enrollment.

	// 5. Swap the keyring to the new DataKey.
	unlockKeyring(params.userId, newDataKey);

	logInfo("envelope-rotate", "Full DataKey rotation complete", {
		userId: params.userId,
	});

	return { passphrase };
}
