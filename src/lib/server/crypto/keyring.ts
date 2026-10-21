import { generateDataKey, zeroize } from "./envelope";
import {
	decryptValue,
	encryptValue,
	isEncryptedValue,
	type ValueAAD,
} from "./value-codec";

/**
 * Process-level keyring state machine (design D6).
 *
 *   SEALED ──ceremony(password[+device])──► UNLOCKED
 *      ▲                                        │
 *      └──{idle expiry | logout | process exit}──┘
 *
 * While SEALED there is no DataKey in memory: value-layer reads/writes throw
 * SealedError and hooks.server.ts routes data-bearing requests to the unlock
 * ceremony. A fresh boot (including restart after crash) always starts sealed
 * — nothing on disk can construct the DataKey without a credential secret.
 *
 * The unlocked state also records whether the unlock came via the recovery
 * passphrase (recovery-initiated sessions must re-enroll credentials before
 * any data-bearing route becomes usable — spec recovery-credentials).
 */

export type KeyringStateName = "sealed" | "unlocked";

/** Typed error raised by value-layer data access while sealed. */
export class SealedError extends Error {
	constructor(message = "Keyring is sealed — unlock ceremony required") {
		super(message);
		this.name = "SealedError";
	}
}

interface UnlockedState {
	userId: number;
	dataKey: Buffer;
	recoveryInitiated: boolean;
	unlockedAt: number;
}

let unlocked: UnlockedState | null = null;

/** Best-effort zeroize + drop the unlocked state. Idempotent. */
export function sealKeyring(reason: string): void {
	if (unlocked) {
		zeroize(unlocked.dataKey);
		unlocked = null;
	}
	// Reason is deliberately not persisted — it is carried to the UI via the
	// redirecting route (login/unlock ?reason=), never stored.
	void reason;
}

/**
 * Unlock the keyring for a user. ANY previously unlocked state — including
 * a same-user non-recovery re-unlock — is sealed (zeroized) first (key
 * hygiene spec: one live keyring state per process; overwriting unlocked
 * state zeroizes the previous DataKey before the new one is assigned).
 */
export function unlockKeyring(
	userId: number,
	dataKey: Buffer,
	options: { recoveryInitiated?: boolean } = {},
): void {
	if (unlocked) {
		sealKeyring("keyring-overwrite");
	}
	unlocked = {
		userId,
		dataKey,
		recoveryInitiated: options.recoveryInitiated ?? false,
		unlockedAt: Date.now(),
	};
}

export function keyringStatus(): {
	state: KeyringStateName;
	userId: number | null;
	recoveryInitiated: boolean;
} {
	return {
		state: unlocked ? "unlocked" : "sealed",
		userId: unlocked?.userId ?? null,
		recoveryInitiated: unlocked?.recoveryInitiated ?? false,
	};
}

/** Is the keyring unlocked for this specific user? */
export function isUnlockedFor(userId: number): boolean {
	return unlocked?.userId === userId;
}

/**
 * The DataKey for value-layer crypto. Throws SealedError while sealed (or
 * unlocked for a different user) — the single enforcement point for all
 * value-layer data access.
 */
export function requireDataKey(userId: number): Buffer {
	if (!unlocked || unlocked.userId !== userId) {
		throw new SealedError();
	}
	return unlocked.dataKey;
}

export function markRecoveryInitiated(userId: number): void {
	if (unlocked?.userId === userId) {
		unlocked.recoveryInitiated = true;
	}
}

export function clearRecoveryInitiated(userId: number): void {
	if (unlocked?.userId === userId) {
		unlocked.recoveryInitiated = false;
	}
}

// ---------------------------------------------------------------------------
// Value-layer field helpers (codec + keyring in one call)
// ---------------------------------------------------------------------------

/**
 * Encrypt a protected column value for storage. AAD binds table/row/column.
 * Throws SealedError while sealed — writes of protected values are impossible
 * without an unlocked keyring.
 */
export function encryptField(
	userId: number,
	aad: ValueAAD,
	plaintext: string,
): string {
	return encryptValue(requireDataKey(userId), plaintext, aad);
}

/**
 * Decrypt a protected column value. Values not in encrypted format (legacy
 * plaintext rows written before the one-shot envelope migration) pass through
 * unchanged so the migration window reads remain functional; the migrator
 * converts them in the same session that unlocks them.
 */
export function decryptField(
	userId: number,
	aad: ValueAAD,
	stored: string | null,
): string | null {
	if (stored === null) return null;
	if (!isEncryptedValue(stored)) return stored; // legacy pre-migration row
	return decryptValue(requireDataKey(userId), stored, aad);
}

/** Convenience: fresh DataKey generation for enrollment/rotation flows. */
export { generateDataKey };

// ---------------------------------------------------------------------------
// Process exit — best-effort zeroization (V8 cannot guarantee it; documented
// accepted hot-tier ceiling). Fresh boot always starts sealed regardless.
// ---------------------------------------------------------------------------

process.on("exit", () => {
	if (unlocked) zeroize(unlocked.dataKey);
});
