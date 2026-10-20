import { and, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "$lib/db/schema";
import { credentialSlots, users } from "$lib/db/schema";
import { logInfo } from "$lib/server/logger";
import {
	EnvelopeError,
	generateDataKey,
	generateSlotId,
	type SlotKind,
	unwrapSlot,
	wrapSlot,
} from "./envelope";
import { sealKeyring, unlockKeyring } from "./keyring";
import {
	derivePasswordSlotKey,
	deriveRecoverySlotKey,
	generateSlotSalt,
} from "./slot-keys";

/**
 * Keyring slot persistence — the only module that writes credential_slots.
 * No admin/reset path exists: slots are only ever created or re-wrapped with
 * a credential secret presented in the ceremony (spec recovery-credentials:
 * "No server-side secret reset exists").
 */

export type KeyringDb = BetterSQLite3Database<typeof schema>;

export interface SlotRecord {
	slotId: string;
	kind: SlotKind;
	wrappedKey: string;
	iv: string;
	metadata: Record<string, unknown>;
	createdAt: Date;
}

export async function getActiveSlots(
	db: KeyringDb,
	userId: number,
	kind?: SlotKind,
): Promise<SlotRecord[]> {
	const conditions = [
		eq(credentialSlots.userId, userId),
		isNull(credentialSlots.revokedAt),
	];
	if (kind) {
		conditions.push(
			eq(
				credentialSlots.kind,
				kind as "password" | "webauthn-prf" | "recovery-passphrase",
			),
		);
	}
	const rows = await db
		.select({
			slotId: credentialSlots.slotId,
			kind: credentialSlots.kind,
			wrappedKey: credentialSlots.wrappedKey,
			iv: credentialSlots.iv,
			metadata: credentialSlots.metadata,
			createdAt: credentialSlots.createdAt,
		})
		.from(credentialSlots)
		.where(and(...conditions));
	return rows.map((r) => ({
		...r,
		metadata: (r.metadata ?? {}) as Record<string, unknown>,
	}));
}

export async function countActiveSlots(
	db: KeyringDb,
	userId: number,
	kind: SlotKind,
): Promise<number> {
	const slots = await getActiveSlots(db, userId, kind);
	return slots.length;
}

/** True when the user has an enrolled envelope (at least one active slot). */
export async function hasEnvelope(
	db: KeyringDb,
	userId: number,
): Promise<boolean> {
	const slots = await getActiveSlots(db, userId);
	return slots.length > 0;
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

export interface EnrollResult {
	dataKey: Buffer;
	slotId: string;
}

/** Enroll (or re-enroll) the password slot wrapping the user's DataKey. */
export async function enrollPasswordSlot(
	db: KeyringDb,
	params: {
		userId: number;
		password: string;
		passwordSalt: string;
		dataKey?: Buffer;
	},
): Promise<EnrollResult> {
	const dataKey = params.dataKey ?? generateDataKey();
	const slotKey = await derivePasswordSlotKey(
		params.password,
		params.passwordSalt,
	);
	const slotId = generateSlotId();
	const wrapped = wrapSlot(dataKey, slotKey, {
		kind: "password",
		userId: params.userId,
		slotId,
	});
	await db.insert(credentialSlots).values({
		slotId,
		userId: params.userId,
		kind: "password",
		wrappedKey: wrapped.wrappedKey,
		iv: wrapped.iv,
		metadata: { label: "Password" },
		createdAt: new Date(),
	});
	logInfo("keyring", "Password slot enrolled", {
		userId: params.userId,
		slotId,
	});
	return { dataKey, slotId };
}

/**
 * Enroll the recovery (paper passphrase) slot. Generates a CSPRNG diceware
 * passphrase when none is supplied — the passphrase is returned exactly once
 * for display; the system never stores or shows it again.
 */
export async function enrollRecoverySlot(
	db: KeyringDb,
	params: {
		userId: number;
		dataKey?: Buffer;
		passphrase?: string;
	},
): Promise<EnrollResult & { passphrase: string }> {
	const { generateRecoveryPassphrase } = await import("./diceware");
	const passphrase = params.passphrase ?? generateRecoveryPassphrase();
	const dataKey = params.dataKey ?? generateDataKey();
	const salt = generateSlotSalt();
	const slotKey = await deriveRecoverySlotKey(passphrase, salt);
	const slotId = generateSlotId();
	const wrapped = wrapSlot(dataKey, slotKey, {
		kind: "recovery-passphrase",
		userId: params.userId,
		slotId,
	});
	await db.insert(credentialSlots).values({
		slotId,
		userId: params.userId,
		kind: "recovery-passphrase",
		wrappedKey: wrapped.wrappedKey,
		iv: wrapped.iv,
		metadata: { label: "Recovery paper", salt },
		createdAt: new Date(),
	});
	logInfo("keyring", "Recovery slot enrolled", {
		userId: params.userId,
		slotId,
	});
	return { dataKey, slotId, passphrase };
}

// ---------------------------------------------------------------------------
// Unwrap (ceremony)
// ---------------------------------------------------------------------------

/**
 * Unwrap the DataKey with the user's password. MUST be called only after the
 * Argon2id auth-hash check passed — the auth hash is the rate-limited gate;
 * unwrap failure must never be the only signal (design D2).
 */
export async function unwrapPasswordSlot(
	db: KeyringDb,
	user: { id: number; passwordSalt: string },
	password: string,
): Promise<Buffer> {
	const slots = await getActiveSlots(db, user.id, "password");
	const slot = slots[0];
	if (!slot) {
		throw new EnvelopeError(
			"WRONG_SLOT",
			"No active password slot — account requires envelope migration",
		);
	}
	const slotKey = await derivePasswordSlotKey(password, user.passwordSalt);
	return unwrapSlot({ wrappedKey: slot.wrappedKey, iv: slot.iv }, slotKey, {
		kind: "password",
		userId: user.id,
		slotId: slot.slotId,
	});
}

/** Unwrap via a recovery slot (single-factor break-glass — wallet semantics). */
export async function unwrapRecoverySlot(
	db: KeyringDb,
	userId: number,
	passphrase: string,
): Promise<Buffer> {
	const slots = await getActiveSlots(db, userId, "recovery-passphrase");
	const slot = slots[0];
	if (!slot) {
		throw new EnvelopeError("WRONG_SLOT", "No active recovery slot");
	}
	const salt = typeof slot.metadata.salt === "string" ? slot.metadata.salt : "";
	if (!salt) {
		throw new EnvelopeError("BAD_FORMAT", "Recovery slot missing KDF salt");
	}
	const slotKey = await deriveRecoverySlotKey(passphrase, salt);
	return unwrapSlot({ wrappedKey: slot.wrappedKey, iv: slot.iv }, slotKey, {
		kind: "recovery-passphrase",
		userId,
		slotId: slot.slotId,
	});
}

/** Ceremony helper: unwrap + transition the keyring to unlocked. */
export async function unlockWithPassword(
	db: KeyringDb,
	user: { id: number; passwordSalt: string },
	password: string,
): Promise<void> {
	const dataKey = await unwrapPasswordSlot(db, user, password);
	unlockKeyring(user.id, dataKey);
}

// ---------------------------------------------------------------------------
// Rotation (slot tier — cheap, no data rewrite)
// ---------------------------------------------------------------------------

/**
 * Password change / re-enrollment: re-wrap the password slot under the new
 * password (fresh salt), leave the DataKey and every other slot (and all
 * encrypted data) untouched. Returns the new passwordSalt for the users row.
 *
 * Proof of the current credential is one of:
 *  - currentPassword + currentPasswordSalt (normal password change: derives
 *    the old slot key and unwraps with it)
 *  - dataKey from an unlocked keyring (recovery re-enrollment: the paper
 *    unwrap already proved possession; the old password may be lost)
 */
export async function rewrapPasswordSlot(
	db: KeyringDb,
	params: {
		userId: number;
		newPassword: string;
		currentPassword?: string;
		currentPasswordSalt?: string;
		dataKey?: Buffer;
	},
): Promise<{ passwordSalt: string; slotId: string }> {
	const slots = await getActiveSlots(db, params.userId, "password");
	const slot = slots[0];
	if (!slot) {
		throw new EnvelopeError("WRONG_SLOT", "No active password slot");
	}

	let dataKey: Buffer;
	if (params.dataKey) {
		dataKey = params.dataKey;
	} else if (params.currentPassword && params.currentPasswordSalt) {
		const oldSlotKey = await derivePasswordSlotKey(
			params.currentPassword,
			params.currentPasswordSalt,
		);
		dataKey = unwrapSlot(
			{ wrappedKey: slot.wrappedKey, iv: slot.iv },
			oldSlotKey,
			{ kind: "password", userId: params.userId, slotId: slot.slotId },
		);
	} else {
		throw new EnvelopeError(
			"BAD_FORMAT",
			"Password re-wrap requires the current password or an unlocked DataKey",
		);
	}

	// Fresh salt + re-wrap the SAME slot row with the SAME DataKey.
	const newSalt = generateSlotSalt();
	const newSlotKey = await derivePasswordSlotKey(params.newPassword, newSalt);
	const wrapped = wrapSlot(dataKey, newSlotKey, {
		kind: "password",
		userId: params.userId,
		slotId: slot.slotId,
	});
	await db
		.update(credentialSlots)
		.set({ wrappedKey: wrapped.wrappedKey, iv: wrapped.iv })
		.where(eq(credentialSlots.slotId, slot.slotId));

	logInfo("keyring", "Password slot re-wrapped (password change)", {
		userId: params.userId,
	});
	return { passwordSalt: newSalt, slotId: slot.slotId };
}

/** Revoke a slot by its public slotId (scoped to the user). Immediate + local. */
export async function revokeSlot(
	db: KeyringDb,
	userId: number,
	slotId: string,
): Promise<boolean> {
	const result = await db
		.update(credentialSlots)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(credentialSlots.slotId, slotId),
				eq(credentialSlots.userId, userId),
				isNull(credentialSlots.revokedAt),
			),
		)
		.returning({ id: credentialSlots.id });
	if (result.length > 0) {
		logInfo("keyring", "Slot revoked", { userId, slotId });
	}
	return result.length > 0;
}

/** Seal + drop key state — used by logout/expiry wiring. */
export { sealKeyring, unlockKeyring };

/** Users-table helper: read the KDF salt for a user id. */
export async function getPasswordSalt(
	db: KeyringDb,
	userId: number,
): Promise<string | null> {
	const row = await db
		.select({ passwordSalt: users.passwordSalt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row[0]?.passwordSalt ?? null;
}
