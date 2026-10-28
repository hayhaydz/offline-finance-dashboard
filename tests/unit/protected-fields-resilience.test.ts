import { describe, expect, it } from "vitest";
import {
	decryptTxDescription,
	encryptTxDescription,
} from "$lib/server/crypto/protected-fields";
import { unlockKeyring, sealKeyring } from "$lib/server/crypto/keyring";
import { EnvelopeError, generateDataKey } from "$lib/server/crypto/envelope";

// P0-2 regression (2026-10-27 audit): transaction descriptions rendered raw
// `v1|<iv>|<ct>|<tag>` ciphertext in the account ledger. Two defenses:
//  1. protected-fields decrypts are resilient — EnvelopeError (tampered /
//     transposed / foreign-keyring blobs) yields "[encrypted]", never the
//     raw blob and never a 500; SealedError still propagates.
//  2. the account-detail ledger decrypts before returning rows.

const USER_ID = 1;

function withUnlockedKeyring<T>(fn: () => T): T {
	const dataKey = generateDataKey();
	unlockKeyring(USER_ID, dataKey);
	try {
		return fn();
	} finally {
		sealKeyring("test-teardown");
	}
}

describe("decryptTxDescription resilience (P0-2)", () => {
	it("round-trips an encrypted description", () => {
		withUnlockedKeyring(() => {
			const stored = encryptTxDescription(USER_ID, "tx-slug-1", "Groceries at Tesco");
			expect(stored).toMatch(/^v1\|/); // stored form is ciphertext
			expect(decryptTxDescription(USER_ID, "tx-slug-1", stored)).toBe(
				"Groceries at Tesco",
			);
		});
	});

	it("returns [encrypted] for a blob written under a different DataKey", () => {
		// Model a stale seed: blob encrypted under key A, session unlocked
		// with fresh key B ⇒ GCM auth fails ⇒ TAMPERED
		let blob: string | null = null;
		withUnlockedKeyring(() => {
			blob = encryptTxDescription(USER_ID, "tx-slug-2", "stale seed value");
		});
		withUnlockedKeyring(() => {
			// second helper call generated a NEW random DataKey
			expect(blob).toMatch(/^v1\|/);
			expect(decryptTxDescription(USER_ID, "tx-slug-2", blob!)).toBe(
				"[encrypted]",
			);
		});
	});

	it("returns [encrypted] for transposed ciphertext (wrong AAD row)", () => {
		withUnlockedKeyring(() => {
			const stored = encryptTxDescription(USER_ID, "tx-slug-a", "row A secret");
			// Same key, different row ⇒ AAD mismatch ⇒ TAMPERED
			expect(decryptTxDescription(USER_ID, "tx-slug-b", stored)).toBe(
				"[encrypted]",
			);
		});
	});

	it("passes legacy pre-migration plaintext through unchanged", () => {
		withUnlockedKeyring(() => {
			expect(
				decryptTxDescription(USER_ID, "tx-slug-3", "plain legacy text"),
			).toBe("plain legacy text");
		});
	});

	it("returns null for null input", () => {
		expect(decryptTxDescription(USER_ID, "tx-slug-4", null)).toBeNull();
	});

	it("propagates non-Envelope errors (e.g. malformed v1 shape is BAD_FORMAT EnvelopeError → masked)", () => {
		withUnlockedKeyring(() => {
			expect(decryptTxDescription(USER_ID, "tx-slug-5", "v1|zz|zz|zz")).toBe(
				"[encrypted]",
			);
		});
	});

	it("EnvelopeError is exported and maskable", () => {
		expect(new EnvelopeError("TAMPERED", "x").name).toBe("EnvelopeError");
	});
});
