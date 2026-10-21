import { and, eq, isNull } from "drizzle-orm";
import {
	accountNotes,
	accounts,
	accountTransactions,
	credentialSlots,
	monthlyReviews,
	users,
} from "$lib/db/schema";
import { logInfo } from "$lib/server/logger";
import { getActiveSlots, type KeyringDb } from "./enroll";
import {
	generateDataKey,
	generateSlotId,
	wrapSlot,
	zeroize,
} from "./envelope";
import { requireDataKey, unlockKeyring } from "./keyring";
import {
	derivePasswordSlotKey,
	deriveRecoverySlotKey,
	generateSlotSalt,
} from "./slot-keys";
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
	/**
	 * The DataKey this migration created (unlock with it). Null when a
	 * password slot already existed (resume path — the caller unwraps with
	 * the verified password instead).
	 */
	dataKey: Buffer | null;
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
		return { tables: [], slotId: null, dataKey: null };
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

	return { tables: results, slotId, dataKey };
}

/**
 * Full DataKey rotation (task 4.4) — reserved for recovery-paper compromise.
 * Re-encrypts all protected data under a fresh DataKey, re-wraps every
 * re-wrappable slot, and issues a NEW recovery passphrase (shown once by the
 * caller). Requires a fully unlocked keyring (settings action behind full
 * unlock).
 *
 * Crash-atomic (spec envelope-encryption): every write is STAGED in memory
 * first (re-encrypted ciphertexts, re-wrapped slots), then committed in ONE
 * synchronous transaction. A crash before commit leaves the complete
 * pre-rotation state; after commit, the complete post-rotation state — never
 * a mixture.
 *
 * Device slots CANNOT be re-wrapped server-side (their wrapping key never
 * leaves the device) — they are revoked in the same transaction and the
 * caller must tell the user to re-enroll (deviceSlotsRevoked flag). Unlock
 * enforcement is slot-existence-based, so revocation lands the account at
 * L1 (password-only) — never a brick.
 */
export async function rotateUserEnvelope(
	db: KeyringDb,
	params: {
		userId: number;
		password: string;
	},
): Promise<{ passphrase: string; deviceSlotsRevoked: boolean }> {
	const oldDataKey = requireDataKey(params.userId);
	const newDataKey = generateDataKey();

	// --- STAGE (all crypto in memory; Argon2id derives are async and MUST
	// run before the synchronous transaction body).

	// 1. Re-encrypt every protected value under the new DataKey.
	const stagedRows: Array<{
		table: ProtectedTable;
		slug: string;
		encrypted: string;
	}> = [];
	for (const t of PROTECTED_TABLES) {
		const rows = t.readAll(db, params.userId);
		for (const row of rows) {
			if (row.value === null || !isEncryptedValue(row.value)) continue;
			const aad: ValueAAD = {
				table: t.table,
				rowId: row.slug,
				column: t.column,
			};
			stagedRows.push({
				table: t,
				slug: row.slug,
				encrypted: encryptValue(
					newDataKey,
					decryptValue(oldDataKey, row.value, aad),
					aad,
				),
			});
		}
	}

	// 2. Re-wrap the password slot over the NEW DataKey (same password,
	// fresh salt — users.passwordSalt must track the slot salt).
	const passwordSlots = await getActiveSlots(db, params.userId, "password");
	let passwordRewrap: {
		slotId: string;
		wrappedKey: string;
		iv: string;
		newSalt: string;
	} | null = null;
	if (passwordSlots.length > 0) {
		const slot = passwordSlots[0];
		const newSalt = generateSlotSalt();
		const newSlotKey = await derivePasswordSlotKey(params.password, newSalt);
		const rewrapped = wrapSlot(newDataKey, newSlotKey, {
			kind: "password",
			userId: params.userId,
			slotId: slot.slotId,
		});
		passwordRewrap = {
			slotId: slot.slotId,
			wrappedKey: rewrapped.wrappedKey,
			iv: rewrapped.iv,
			newSalt,
		};
	}

	// 3. Recovery paper: the (possibly compromised) passphrase is revoked and
	// a fresh CSPRNG passphrase + salt wrap the NEW key — staged in memory.
	const recoverySlots = await getActiveSlots(
		db,
		params.userId,
		"recovery-passphrase",
	);
	const { generateRecoveryPassphrase } = await import("./diceware");
	const passphrase = generateRecoveryPassphrase();
	const recoverySalt = generateSlotSalt();
	const recoverySlotKey = await deriveRecoverySlotKey(passphrase, recoverySalt);
	const recoverySlotId = generateSlotId();
	const wrappedRecovery = wrapSlot(newDataKey, recoverySlotKey, {
		kind: "recovery-passphrase",
		userId: params.userId,
		slotId: recoverySlotId,
	});

	// 4. Device slots: revoked (not re-wrapped — impossible server-side).
	const deviceSlots = await getActiveSlots(db, params.userId, "webauthn-prf");

	// --- COMMIT: ciphertexts, slot re-writes, revocations — ONE transaction.
	const now = new Date();
	db.transaction((tx) => {
		for (const staged of stagedRows) {
			staged.table.updateOne(tx as unknown as KeyringDb, staged.slug, staged.encrypted);
		}
		if (passwordRewrap) {
			tx.update(credentialSlots)
				.set({ wrappedKey: passwordRewrap.wrappedKey, iv: passwordRewrap.iv })
				.where(eq(credentialSlots.slotId, passwordRewrap.slotId))
				.run();
			tx.update(users)
				.set({ passwordSalt: passwordRewrap.newSalt, updatedAt: now })
				.where(eq(users.id, params.userId))
				.run();
		}
		for (const slot of [...recoverySlots, ...deviceSlots]) {
			tx.update(credentialSlots)
				.set({ revokedAt: now })
				.where(
					and(
						eq(credentialSlots.slotId, slot.slotId),
						eq(credentialSlots.userId, params.userId),
						isNull(credentialSlots.revokedAt),
					),
				)
				.run();
		}
		tx.insert(credentialSlots)
			.values({
				slotId: recoverySlotId,
				userId: params.userId,
				kind: "recovery-passphrase",
				wrappedKey: wrappedRecovery.wrappedKey,
				iv: wrappedRecovery.iv,
				metadata: { label: "Recovery paper", salt: recoverySalt },
				createdAt: now,
			})
			.run();
	});

	// Swap the keyring to the new DataKey — unlockKeyring seals (zeroizes)
	// the previous state first (key hygiene: one live keyring per process).
	unlockKeyring(params.userId, newDataKey);
	zeroize(oldDataKey); // same buffer the seal path already wiped — idempotent

	logInfo("envelope-rotate", "Full DataKey rotation complete", {
		userId: params.userId,
		deviceSlotsRevoked: deviceSlots.length,
	});

	return { passphrase, deviceSlotsRevoked: deviceSlots.length > 0 };
}
