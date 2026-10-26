import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "$lib/auth/password";
import { db } from "$lib/db/client";
import {
	accountNotes,
	accounts,
	accountTransactions,
	credentialSlots,
	monthlyReviews,
	users,
} from "$lib/db/schema";
import {
	generateRecoveryPassphrase,
	normalizePassphrase,
} from "$lib/server/crypto/diceware";
import {
	enrollPasswordSlot,
	enrollRecoverySlot,
	getActiveSlots,
	revokeSlot,
	rewrapPasswordSlot,
	unwrapPasswordSlot,
	unwrapRecoverySlot,
} from "$lib/server/crypto/enroll";
import { EnvelopeError } from "$lib/server/crypto/envelope";
import {
	decryptField,
	isUnlockedFor,
	sealKeyring,
	unlockKeyring,
} from "$lib/server/crypto/keyring";
import {
	migrateUserEnvelope,
	rotateUserEnvelope,
} from "$lib/server/crypto/migrate-envelope";

/**
 * Full envelope lifecycle against the real test database: enrollment,
 * ceremony unwrap, sealed guards, recovery flow, migration, rotation tiers.
 */

const PASSWORD = "correct-horse-battery-13!";
const cleanupUserIds: number[] = [];

async function insertLegacyUser(username: string) {
	const passwordSalt = crypto.randomBytes(16).toString("hex");
	const passwordHash = await hashPassword(PASSWORD);
	const [user] = await db
		.insert(users)
		.values({
			username,
			passwordHash,
			passwordSalt,
		})
		.returning();
	cleanupUserIds.push(user.id);
	return user;
}

beforeEach(() => {
	sealKeyring("test-setup");
});

afterEach(async () => {
	sealKeyring("test-teardown");
	if (cleanupUserIds.length > 0) {
		// FK order: transactions + notes reference accounts; slots/reviews
		// reference users.
		const userAccounts = await db
			.select({ id: accounts.id })
			.from(accounts)
			.where(inArray(accounts.userId, cleanupUserIds));
		const accountIds = userAccounts.map((a) => a.id);
		if (accountIds.length > 0) {
			await db
				.delete(accountTransactions)
				.where(inArray(accountTransactions.accountId, accountIds));
			await db
				.delete(accountNotes)
				.where(inArray(accountNotes.accountId, accountIds));
		}
		await db
			.delete(credentialSlots)
			.where(inArray(credentialSlots.userId, cleanupUserIds));
		await db
			.delete(monthlyReviews)
			.where(inArray(monthlyReviews.userId, cleanupUserIds));
		await db.delete(accounts).where(inArray(accounts.userId, cleanupUserIds));
		await db.delete(users).where(inArray(users.id, cleanupUserIds));
		cleanupUserIds.length = 0;
	}
});

describe("envelope lifecycle", () => {
	it("enrolls a password slot whose unwrap reproduces the DataKey; wrong password fails", async () => {
		const user = await insertLegacyUser(`env-user-${Date.now()}`);
		const { dataKey } = await enrollPasswordSlot(db, {
			userId: user.id,
			password: PASSWORD,
			passwordSalt: user.passwordSalt,
		});

		// Slot row exists; wrapped material never contains the raw DataKey
		const slots = await getActiveSlots(db, user.id, "password");
		expect(slots).toHaveLength(1);
		expect(slots[0].wrappedKey).not.toContain(dataKey.toString("hex"));

		// Correct password unwraps to the same DataKey
		const unwrapped = await unwrapPasswordSlot(db, user, PASSWORD);
		expect(unwrapped.equals(dataKey)).toBe(true);

		// Wrong password fails
		await expect(
			unwrapPasswordSlot(db, user, "wrong-password-12345"),
		).rejects.toThrow(EnvelopeError);
	});

	it("revocation is immediate and local (spec envelope-encryption)", async () => {
		const user = await insertLegacyUser(`env-revoke-${Date.now()}`);
		const { dataKey } = await enrollPasswordSlot(db, {
			userId: user.id,
			password: PASSWORD,
			passwordSalt: user.passwordSalt,
		});
		const { slotId } = await enrollRecoverySlot(db, {
			userId: user.id,
			dataKey,
			passphrase:
				"alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
		});

		expect(await revokeSlot(db, user.id, slotId)).toBe(true);
		// Other slot untouched, still unwraps
		const unwrapped = await unwrapPasswordSlot(db, user, PASSWORD);
		expect(unwrapped.equals(dataKey)).toBe(true);
		// Revoked slot no longer listed as active
		expect(
			await getActiveSlots(db, user.id, "recovery-passphrase"),
		).toHaveLength(0);
	});

	it("password change re-wraps the slot only — DataKey and data untouched", async () => {
		const user = await insertLegacyUser(`env-pw-${Date.now()}`);
		const { dataKey } = await enrollPasswordSlot(db, {
			userId: user.id,
			password: PASSWORD,
			passwordSalt: user.passwordSalt,
		});

		const newPassword = "fresh-staple-cabbage-77!";
		const { passwordSalt: newSalt } = await rewrapPasswordSlot(db, {
			userId: user.id,
			currentPassword: PASSWORD,
			currentPasswordSalt: user.passwordSalt,
			newPassword,
		});
		expect(newSalt).not.toBe(user.passwordSalt);

		// Old password no longer unwraps; new one does — same DataKey
		await expect(unwrapPasswordSlot(db, user, PASSWORD)).rejects.toThrow(
			EnvelopeError,
		);
		const rewrapped = await unwrapPasswordSlot(
			db,
			{
				id: user.id,
				passwordSalt: newSalt,
			},
			newPassword,
		);
		expect(rewrapped.equals(dataKey)).toBe(true);
	});
});

describe("recovery credentials", () => {
	it("generates a 12-word CSPRNG diceware passphrase", () => {
		const passphrase = generateRecoveryPassphrase();
		expect(passphrase.split(" ")).toHaveLength(12);
		// Two generations differ (random, not fixed)
		expect(passphrase).not.toBe(generateRecoveryPassphrase());
		// Normalisation collapses case/whitespace
		expect(normalizePassphrase("  Alpha   BETA  ")).toBe("alpha beta");
	});

	it("recovery unwrap yields the same DataKey (single-factor break-glass)", async () => {
		const user = await insertLegacyUser(`env-rec-${Date.now()}`);
		const { dataKey } = await enrollPasswordSlot(db, {
			userId: user.id,
			password: PASSWORD,
			passwordSalt: user.passwordSalt,
		});
		const { passphrase } = await enrollRecoverySlot(db, {
			userId: user.id,
			dataKey,
		});
		expect(passphrase.split(" ")).toHaveLength(12);

		const viaPaper = await unwrapRecoverySlot(db, user.id, passphrase);
		expect(viaPaper.equals(dataKey)).toBe(true);

		await expect(
			unwrapRecoverySlot(db, user.id, "not the passphrase"),
		).rejects.toThrow(EnvelopeError);
	});
});

describe("one-shot migration (task 5.1)", () => {
	it("encrypts legacy plaintext columns transactionally and is idempotent", async () => {
		const user = await insertLegacyUser(`env-mig-${Date.now()}`);

		// Legacy data: plaintext protected values
		const [account] = await db
			.insert(accounts)
			.values({
				slug: `mig-account-${user.id}`,
				userId: user.id,
				name: "Migration Account",
				type: "current",
				taxWrapper: "none",
				category: "asset",
			})
			.returning();
		await db.insert(accountTransactions).values({
			slug: `mig-tx-${user.id}`,
			accountId: account.id,
			type: "deposit",
			amount: 12345,
			description: "Salary — plaintext legacy",
			transactionDate: new Date(),
		});
		await db.insert(accountNotes).values({
			slug: `mig-note-${user.id}`,
			accountId: account.id,
			content: "Plaintext note",
			createdAt: new Date(),
		});
		await db.insert(monthlyReviews).values({
			slug: `mig-review-${user.id}`,
			userId: user.id,
			yearMonth: "2026-09",
			notes: "Plaintext review notes",
		});

		// A SECOND user's plaintext rows must never be touched by this
		// user's migration (user-scoped reads — parallel-test + multi-user
		// regression guard).
		const otherUser = await insertLegacyUser(`env-other-${Date.now()}`);
		const [otherAccount] = await db
			.insert(accounts)
			.values({
				slug: `mig-other-account-${otherUser.id}`,
				userId: otherUser.id,
				name: "Other User Account",
				type: "current",
				taxWrapper: "none",
				category: "asset",
			})
			.returning();
		await db.insert(accountTransactions).values({
			slug: `mig-other-tx-${otherUser.id}`,
			accountId: otherAccount.id,
			type: "deposit",
			amount: 999,
			description: "Other user plaintext",
			transactionDate: new Date(),
		});

		const result = await migrateUserEnvelope(db, {
			userId: user.id,
			password: PASSWORD,
			passwordSalt: user.passwordSalt,
		});

		// Counts verified per table — deterministic (this user's rows only)
		const txTable = result.tables.find(
			(t) => t.table === "account_transactions",
		);
		const noteTable = result.tables.find((t) => t.table === "account_notes");
		const reviewTable = result.tables.find(
			(t) => t.table === "monthly_reviews",
		);
		expect(txTable?.rowsEncrypted).toBe(1);
		expect(noteTable?.rowsEncrypted).toBe(1);
		expect(reviewTable?.rowsEncrypted).toBe(1);

		// The OTHER user's row is untouched (still plaintext, still readable
		// via the tolerant legacy path)
		const [otherRow] = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.slug, `mig-other-tx-${otherUser.id}`));
		expect(otherRow.description).toBe("Other user plaintext");

		// Stored values are now ciphertext
		const [txRow] = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.slug, `mig-tx-${user.id}`));
		expect(txRow.description?.startsWith("v1|")).toBe(true);

		// Unwrap + decrypt round-trip through the keyring
		const dataKey = await unwrapPasswordSlot(db, user, PASSWORD);
		unlockKeyring(user.id, dataKey);
		expect(
			decryptField(
				user.id,
				{
					table: "account_transactions",
					rowId: txRow.slug,
					column: "description",
				},
				txRow.description,
			),
		).toBe("Salary — plaintext legacy");

		// Second run is a no-op (idempotent)
		const again = await migrateUserEnvelope(db, {
			userId: user.id,
			password: PASSWORD,
			passwordSalt: user.passwordSalt,
		});
		expect(again.tables).toHaveLength(0);
	});

	it("full DataKey rotation re-encrypts everything and issues a new passphrase", async () => {
		const user = await insertLegacyUser(`env-rot-${Date.now()}`);

		// Envelope + encrypted data
		const { dataKey } = await enrollPasswordSlot(db, {
			userId: user.id,
			password: PASSWORD,
			passwordSalt: user.passwordSalt,
		});
		await enrollRecoverySlot(db, {
			userId: user.id,
			dataKey,
			passphrase:
				"one two three four five six seven eight nine ten eleven twelve",
		});
		unlockKeyring(user.id, dataKey);

		const [account] = await db
			.insert(accounts)
			.values({
				slug: `rot-account-${user.id}`,
				userId: user.id,
				name: "Rotation Account",
				type: "current",
				taxWrapper: "none",
				category: "asset",
			})
			.returning();
		const txSlug = `rot-tx-${user.id}`;
		await db.insert(accountTransactions).values({
			slug: txSlug,
			accountId: account.id,
			type: "interest",
			amount: 500,
			description: "Before rotation",
			transactionDate: new Date(),
		});
		// Encrypt via the codec (app-path parity)
		const { encryptField } = await import("$lib/server/crypto/keyring");
		await db
			.update(accountTransactions)
			.set({
				description: encryptField(
					user.id,
					{
						table: "account_transactions",
						rowId: txSlug,
						column: "description",
					},
					"Before rotation",
				),
			})
			.where(eq(accountTransactions.slug, txSlug));
		const [before] = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.slug, txSlug));

		const { passphrase: newPassphrase } = await rotateUserEnvelope(db, {
			userId: user.id,
			password: PASSWORD,
		});
		expect(newPassphrase.split(" ")).toHaveLength(12);

		// Data re-encrypted (different ciphertext bytes)
		const [after] = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.slug, txSlug));
		expect(after.description).not.toBe(before.description);
		expect(after.description?.startsWith("v1|")).toBe(true);

		// Keyring now holds the NEW DataKey and decrypts the new ciphertext
		const roundTrip = decryptField(
			user.id,
			{ table: "account_transactions", rowId: txSlug, column: "description" },
			after.description,
		);
		expect(roundTrip).toBe("Before rotation");

		// The NEW recovery passphrase unwraps the new DataKey (rotation also
		// rotated users.passwordSalt — re-read the row for the derivation).
		const viaPaper = await unwrapRecoverySlot(db, user.id, newPassphrase);
		const [freshUser] = await db
			.select({ id: users.id, passwordSalt: users.passwordSalt })
			.from(users)
			.where(eq(users.id, user.id));
		const viaPassword = await unwrapPasswordSlot(db, freshUser, PASSWORD);
		expect(viaPaper.equals(viaPassword)).toBe(true);
	});
});

describe("rotation safety (crypto-rotation-safety)", () => {
	const RECOVERY_PASSPHRASE =
		"one two three four five six seven eight nine ten eleven twelve";

	async function rotationSetup(withDeviceSlot: boolean) {
		const user = await insertLegacyUser(
			`env-safe-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,
		);
		const { dataKey } = await enrollPasswordSlot(db, {
			userId: user.id,
			password: PASSWORD,
			passwordSalt: user.passwordSalt,
		});
		await enrollRecoverySlot(db, {
			userId: user.id,
			dataKey,
			passphrase: RECOVERY_PASSPHRASE,
		});

		// Fake device slot: kind flip of a second slot (wrap material is
		// opaque to rotation — it revokes by kind, never unwraps it).
		let deviceSlotId: string | null = null;
		if (withDeviceSlot) {
			const { slotId } = await enrollRecoverySlot(db, {
				userId: user.id,
				dataKey,
				passphrase:
					"alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
			});
			await db
				.update(credentialSlots)
				.set({ kind: "webauthn-prf" })
				.where(eq(credentialSlots.slotId, slotId));
			deviceSlotId = slotId;
		}

		const [account] = await db
			.insert(accounts)
			.values({
				slug: `safe-account-${user.id}`,
				userId: user.id,
				name: "Safety Account",
				type: "current",
				taxWrapper: "none",
				category: "asset",
			})
			.returning();
		const txSlug = `safe-tx-${user.id}`;
		await db.insert(accountTransactions).values({
			slug: txSlug,
			accountId: account.id,
			type: "interest",
			amount: 4242,
			description: "Rotation payload",
			transactionDate: new Date(),
		});
		const { encryptField } = await import("$lib/server/crypto/keyring");
		unlockKeyring(user.id, dataKey);
		await db
			.update(accountTransactions)
			.set({
				description: encryptField(
					user.id,
					{
						table: "account_transactions",
						rowId: txSlug,
						column: "description",
					},
					"Rotation payload",
				),
			})
			.where(eq(accountTransactions.slug, txSlug));

		const [before] = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.slug, txSlug));

		return { user, dataKey, txSlug, before, deviceSlotId };
	}

	it("rotation with an enrolled device slot revokes it and unlock returns to L1", async () => {
		const { user, txSlug, deviceSlotId } = await rotationSetup(true);
		expect(deviceSlotId).not.toBeNull();

		const { passphrase, deviceSlotsRevoked } = await rotateUserEnvelope(db, {
			userId: user.id,
			password: PASSWORD,
		});
		expect(deviceSlotsRevoked).toBe(true);
		expect(passphrase.split(" ")).toHaveLength(12);

		// Every active device slot is revoked — unlock is password-only (L1)
		expect(await getActiveSlots(db, user.id, "webauthn-prf")).toHaveLength(0);

		// L1 unlock works immediately: password unwrap (fresh salt row)
		// yields the NEW DataKey and decrypts the re-encrypted rows.
		const [freshUser] = await db
			.select({ id: users.id, passwordSalt: users.passwordSalt })
			.from(users)
			.where(eq(users.id, user.id));
		expect(freshUser.passwordSalt).not.toBe(user.passwordSalt);
		const viaPassword = await unwrapPasswordSlot(db, freshUser, PASSWORD);

		sealKeyring("l1-check");
		unlockKeyring(user.id, viaPassword);
		const [after] = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.slug, txSlug));
		expect(
			decryptField(
				user.id,
				{ table: "account_transactions", rowId: txSlug, column: "description" },
				after.description,
			),
		).toBe("Rotation payload");
	});

	it("simulated mid-rotation throw rolls back — old state stays fully decryptable", async () => {
		const { user, dataKey, txSlug, before } = await rotationSetup(true);

		// Poison the commit transaction: throw inside the synchronous body
		// after the first row update lands — better-sqlite3 must roll the
		// WHOLE rotation back (ciphertexts, slots, revocations).
		const realTransaction = db.transaction.bind(db);
		let updates = 0;
		vi.spyOn(db, "transaction").mockImplementationOnce(((cb: unknown) => {
			return realTransaction(((tx: unknown) => {
				return (cb as (t: unknown) => unknown)(
					new Proxy(tx as object, {
						get(target: object, prop, receiver) {
							if (prop === "update") {
								const orig = (
									target as { update: (...a: unknown[]) => unknown }
								).update.bind(target);
								return (...args: unknown[]) => {
									if (++updates >= 2) {
										throw new Error("simulated mid-rotation crash");
									}
									return orig(...args);
								};
							}
							return Reflect.get(target, prop, receiver);
						},
					}),
				);
			}) as never);
		}) as never);

		await expect(
			rotateUserEnvelope(db, { userId: user.id, password: PASSWORD }),
		).rejects.toThrow("simulated mid-rotation crash");
		expect(updates).toBeGreaterThanOrEqual(2);
		vi.restoreAllMocks();

		// Ciphertext unchanged (same bytes as before the attempt)
		const [after] = await db
			.select()
			.from(accountTransactions)
			.where(eq(accountTransactions.slug, txSlug));
		expect(after.description).toBe(before.description);

		// The keyring was never swapped — it still holds the OLD DataKey and
		// decrypts the untouched ciphertext.
		expect(isUnlockedFor(user.id)).toBe(true);
		expect(
			decryptField(
				user.id,
				{ table: "account_transactions", rowId: txSlug, column: "description" },
				after.description,
			),
		).toBe("Rotation payload");

		// Password unwrap still yields the OLD key (slot re-wrap rolled back)
		const viaPassword = await unwrapPasswordSlot(db, user, PASSWORD);
		expect(viaPassword.equals(dataKey)).toBe(true);

		// Old recovery paper still works; device + recovery slots intact
		expect(
			(await unwrapRecoverySlot(db, user.id, RECOVERY_PASSPHRASE)).equals(
				dataKey,
			),
		).toBe(true);
		expect(await getActiveSlots(db, user.id, "webauthn-prf")).toHaveLength(1);
		expect(
			await getActiveSlots(db, user.id, "recovery-passphrase"),
		).toHaveLength(1);

		// The OLD DataKey buffer is NOT zeroized on the rollback path — the
		// pre-rotation state must remain fully usable (only a successful
		// commit discards it).
		expect(dataKey.every((b) => b === 0)).toBe(false);
	});

	it("rotation zeroizes the old DataKey after commit (key hygiene)", async () => {
		const { user, dataKey } = await rotationSetup(false);

		await rotateUserEnvelope(db, { userId: user.id, password: PASSWORD });

		// unlockKeyring swapped in the new key via the always-seal path —
		// the previous DataKey buffer is zeroized where it lives.
		expect(dataKey.every((b) => b === 0)).toBe(true);
		expect(isUnlockedFor(user.id)).toBe(true);
	});
});
