import crypto from "node:crypto";
import { hashRaw } from "@node-rs/argon2";
import { zeroize } from "./envelope";

/**
 * Credential → slot-key derivation (design D2).
 *
 *   slot_key = HKDF-SHA256( Argon2id_raw(secret, salt), info="ofd-envelope-v1" )
 *
 * Domain separation: the Argon2id output is NEVER used directly — HKDF with a
 * fixed `info` label derives an independent 256-bit key stream from the same
 * expensive KDF call, so the derived slot key is unusable as (and independent
 * of) any auth hash. The stored users.passwordHash stays the auth verifier;
 * users.passwordSalt finally becomes the KDF salt it was created to be.
 *
 * Argon2id parameters mirror src/lib/auth/password.ts (OWASP 2025-26).
 */

export const ENVELOPE_HKDF_INFO = "ofd-envelope-v1";

const KDF_OPTIONS = {
	algorithm: 2, // argon2id
	memoryCost: 65536, // 64 MB — matches auth hash cost
	timeCost: 3,
	parallelism: 1,
	outputLen: 32,
} as const;

function hkdf(ikm: Buffer, salt: Buffer): Buffer {
	// crypto.hkdfSync returns ArrayBuffer in some @types/node versions
	return Buffer.from(
		crypto.hkdfSync("sha256", ikm, salt, ENVELOPE_HKDF_INFO, 32),
	);
}

/**
 * Derive the password-slot wrapping key.
 * Deterministic: same (password, passwordSalt) → same key, forever.
 */
export async function derivePasswordSlotKey(
	password: string,
	passwordSaltHex: string,
): Promise<Buffer> {
	const salt = Buffer.from(passwordSaltHex, "hex");
	const argonRaw = await hashRaw(password, { ...KDF_OPTIONS, salt });
	const slotKey = hkdf(argonRaw, salt);
	zeroize(argonRaw);
	return slotKey;
}

/** Generate a fresh salt for credentials that own their salt (recovery, PRF). */
export function generateSlotSalt(): string {
	return crypto.randomBytes(16).toString("hex");
}

/**
 * Derive the recovery-passphrase slot wrapping key. Same scheme as the
 * password slot; the salt is generated at enrollment and stored in the
 * slot's metadata so re-derivation needs only the passphrase.
 */
export async function deriveRecoverySlotKey(
	passphrase: string,
	saltHex: string,
): Promise<Buffer> {
	const salt = Buffer.from(saltHex, "hex");
	const argonRaw = await hashRaw(passphrase, { ...KDF_OPTIONS, salt });
	const slotKey = hkdf(argonRaw, salt);
	zeroize(argonRaw);
	return slotKey;
}
