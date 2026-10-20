import crypto from "node:crypto";
import { EnvelopeError } from "./envelope";

/**
 * Value-layer column codec (design D3).
 *
 * Sensitive columns are encrypted with the per-user DataKey via AES-256-GCM:
 * per-value random IV and AAD binding (table, row id, column) so ciphertext
 * transposed between rows / columns / tables fails authentication.
 *
 * Stored format (versioned for algorithm agility):
 *   v1|<iv hex>|<ciphertext hex>|<tag hex>
 */

export const VALUE_FORMAT_VERSION = "v1";
const VALUE_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

/** Location binding for a value — must match at encrypt AND decrypt time. */
export interface ValueAAD {
	table: string;
	rowId: number | string;
	column: string;
}

function encodeValueAAD(aad: ValueAAD): Buffer {
	return Buffer.from(
		`${VALUE_FORMAT_VERSION}|${aad.table}|${aad.rowId}|${aad.column}`,
		"utf8",
	);
}

export function encryptValue(
	dataKey: Uint8Array,
	plaintext: string,
	aad: ValueAAD,
): string {
	if (dataKey.length !== 32) {
		throw new EnvelopeError("BAD_FORMAT", "DataKey must be 256-bit");
	}
	const iv = crypto.randomBytes(VALUE_IV_BYTES);
	const cipher = crypto.createCipheriv("aes-256-gcm", dataKey, iv);
	cipher.setAAD(encodeValueAAD(aad));
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return [
		VALUE_FORMAT_VERSION,
		iv.toString("hex"),
		ciphertext.toString("hex"),
		tag.toString("hex"),
	].join("|");
}

export function decryptValue(
	dataKey: Uint8Array,
	stored: string,
	aad: ValueAAD,
): string {
	if (dataKey.length !== 32) {
		throw new EnvelopeError("BAD_FORMAT", "DataKey must be 256-bit");
	}

	const parts = stored.split("|");
	if (parts.length !== 4) {
		throw new EnvelopeError("BAD_FORMAT", "Encrypted value has bad shape");
	}
	const [version, ivHex, ctHex, tagHex] = parts;
	if (version !== VALUE_FORMAT_VERSION) {
		throw new EnvelopeError(
			"UNSUPPORTED_VERSION",
			`Encrypted value format ${version} not supported`,
		);
	}

	const iv = Buffer.from(ivHex, "hex");
	const ct = Buffer.from(ctHex, "hex");
	const tag = Buffer.from(tagHex, "hex");
	if (iv.length !== VALUE_IV_BYTES || tag.length !== GCM_TAG_BYTES) {
		throw new EnvelopeError("BAD_FORMAT", "Encrypted value has bad shape");
	}

	const decipher = crypto.createDecipheriv("aes-256-gcm", dataKey, iv);
	decipher.setAAD(encodeValueAAD(aad));
	decipher.setAuthTag(tag);
	try {
		return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
			"utf8",
		);
	} catch {
		// Covers tampering AND transposition (AAD mismatch) uniformly.
		throw new EnvelopeError(
			"TAMPERED",
			"Value decrypt failed: tampered or transposed ciphertext",
		);
	}
}

/** Is this stored value in encrypted format? (vs legacy plaintext column) */
export function isEncryptedValue(stored: string | null | undefined): boolean {
	return typeof stored === "string" && stored.startsWith("v1|");
}
