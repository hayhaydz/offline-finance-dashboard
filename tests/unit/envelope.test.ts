import { hashRaw } from "@node-rs/argon2";
import { describe, expect, it } from "vitest";
import {
	EnvelopeError,
	generateDataKey,
	generateSlotId,
	type SlotAAD,
	unwrapSlot,
	wrapSlot,
} from "$lib/server/crypto/envelope";
import {
	derivePasswordSlotKey,
	deriveRecoverySlotKey,
	generateSlotSalt,
} from "$lib/server/crypto/slot-keys";
import {
	decryptValue,
	encryptValue,
	isEncryptedValue,
	type ValueAAD,
} from "$lib/server/crypto/value-codec";

const SALT_A = "a".repeat(32); // 16 bytes hex
const SALT_B = "b".repeat(32);

function makeAAD(overrides: Partial<SlotAAD> = {}): SlotAAD {
	return {
		kind: "password",
		userId: 1,
		slotId: generateSlotId(),
		...overrides,
	};
}

describe("envelope slot wrap/unwrap (task 1.1)", () => {
	it("generates unique 256-bit DataKeys", () => {
		const a = generateDataKey();
		const b = generateDataKey();
		expect(a).toHaveLength(32);
		expect(b).toHaveLength(32);
		expect(a.equals(b)).toBe(false);
	});

	it("round-trips a DataKey through wrap/unwrap", () => {
		const dataKey = generateDataKey();
		const slotKey = generateDataKey();
		const aad = makeAAD();
		const wrapped = wrapSlot(dataKey, slotKey, aad);
		const unwrapped = unwrapSlot(wrapped, slotKey, aad);
		expect(unwrapped.equals(dataKey)).toBe(true);
	});

	it("uses a random IV — same inputs produce different ciphertext, both valid", () => {
		const dataKey = generateDataKey();
		const slotKey = generateDataKey();
		const aad = makeAAD();
		const w1 = wrapSlot(dataKey, slotKey, aad);
		const w2 = wrapSlot(dataKey, slotKey, aad);
		expect(w1.wrappedKey).not.toBe(w2.wrappedKey);
		expect(w1.iv).not.toBe(w2.iv);
		expect(unwrapSlot(w1, slotKey, aad).equals(dataKey)).toBe(true);
		expect(unwrapSlot(w2, slotKey, aad).equals(dataKey)).toBe(true);
	});

	it("rejects tampered wrapped bytes", () => {
		const dataKey = generateDataKey();
		const slotKey = generateDataKey();
		const aad = makeAAD();
		const wrapped = wrapSlot(dataKey, slotKey, aad);
		const raw = Buffer.from(wrapped.wrappedKey, "hex");
		raw[3] ^= 0xff;
		expect(() =>
			unwrapSlot({ ...wrapped, wrappedKey: raw.toString("hex") }, slotKey, aad),
		).toThrow(EnvelopeError);
	});

	it("rejects the wrong credential key", () => {
		const dataKey = generateDataKey();
		const aad = makeAAD();
		const wrapped = wrapSlot(dataKey, generateDataKey(), aad);
		expect(() => unwrapSlot(wrapped, generateDataKey(), aad)).toThrow(
			EnvelopeError,
		);
	});

	it("rejects a slot unwrapped against the wrong AAD (user / slot / kind)", () => {
		const dataKey = generateDataKey();
		const slotKey = generateDataKey();
		const aad = makeAAD();
		const wrapped = wrapSlot(dataKey, slotKey, aad);
		expect(() =>
			unwrapSlot(wrapped, slotKey, makeAAD({ slotId: generateSlotId() })),
		).toThrow(EnvelopeError);
		expect(() => unwrapSlot(wrapped, slotKey, makeAAD({ userId: 2 }))).toThrow(
			EnvelopeError,
		);
		expect(() =>
			unwrapSlot(wrapped, slotKey, makeAAD({ kind: "recovery-passphrase" })),
		).toThrow(EnvelopeError);
	});

	it("never stores the raw DataKey inside the wrapped slot", () => {
		const dataKey = generateDataKey();
		const slotKey = generateDataKey();
		const wrapped = wrapSlot(dataKey, slotKey, makeAAD());
		// The wrapped bytes must not contain the raw DataKey as a substring
		const hexDataKey = dataKey.toString("hex");
		expect(wrapped.wrappedKey).not.toContain(hexDataKey);
	});
});

describe("password-slot key derivation (task 1.2)", () => {
	it("is stable across calls (deterministic)", async () => {
		const k1 = await derivePasswordSlotKey("correct horse", SALT_A);
		const k2 = await derivePasswordSlotKey("correct horse", SALT_A);
		expect(k1.equals(k2)).toBe(true);
		expect(k1).toHaveLength(32);
	});

	it("derives a key that is NOT the raw Argon2id output (domain separation)", async () => {
		const password = "correct horse battery";
		const salt = Buffer.from(SALT_A, "hex");
		const argonRaw = await hashRaw(password, {
			algorithm: 2,
			memoryCost: 65536,
			timeCost: 3,
			parallelism: 1,
			outputLen: 32,
			salt,
		});
		const slotKey = await derivePasswordSlotKey(password, SALT_A);
		expect(slotKey.equals(argonRaw)).toBe(false);
	});

	it("different password or salt derives a different key", async () => {
		const base = await derivePasswordSlotKey("passphrase-one", SALT_A);
		const otherPw = await derivePasswordSlotKey("passphrase-two", SALT_A);
		const otherSalt = await derivePasswordSlotKey("passphrase-one", SALT_B);
		expect(base.equals(otherPw)).toBe(false);
		expect(base.equals(otherSalt)).toBe(false);
	});

	it("recovery derivation uses the same scheme with its own salt", async () => {
		const salt = generateSlotSalt();
		const k1 = await deriveRecoverySlotKey(`word ${"x ".repeat(11)}`, salt);
		const k2 = await deriveRecoverySlotKey(`word ${"x ".repeat(11)}`, salt);
		expect(k1.equals(k2)).toBe(true);
		expect(k1).toHaveLength(32);
	});
});

describe("value-layer column codec (task 1.3)", () => {
	const dataKey = generateDataKey();
	const aad: ValueAAD = { table: "accounts", rowId: 42, column: "name" };

	it("round-trips plaintext", () => {
		const stored = encryptValue(dataKey, "Virgin Money ISA", aad);
		expect(decryptValue(dataKey, stored, aad)).toBe("Virgin Money ISA");
	});

	it("produces unique ciphertext per call (random IV) and is version-tagged", () => {
		const c1 = encryptValue(dataKey, "same", aad);
		const c2 = encryptValue(dataKey, "same", aad);
		expect(c1).not.toBe(c2);
		expect(c1.startsWith("v1|")).toBe(true);
		expect(isEncryptedValue(c1)).toBe(true);
		expect(isEncryptedValue("plain text")).toBe(false);
		expect(isEncryptedValue(null)).toBe(false);
	});

	it("rejects transposition across table, row, and column", () => {
		const stored = encryptValue(dataKey, "payload", aad);
		expect(() =>
			decryptValue(dataKey, stored, { ...aad, table: "goals" }),
		).toThrow(EnvelopeError);
		expect(() => decryptValue(dataKey, stored, { ...aad, rowId: 43 })).toThrow(
			EnvelopeError,
		);
		expect(() =>
			decryptValue(dataKey, stored, { ...aad, column: "notes" }),
		).toThrow(EnvelopeError);
	});

	it("rejects tampered ciphertext", () => {
		const stored = encryptValue(dataKey, "payload", aad);
		const parts = stored.split("|");
		const ct = Buffer.from(parts[2], "hex");
		ct[0] ^= 0xff;
		parts[2] = ct.toString("hex");
		expect(() => decryptValue(dataKey, parts.join("|"), aad)).toThrow(
			EnvelopeError,
		);
	});

	it("rejects an unknown format version", () => {
		const stored = encryptValue(dataKey, "payload", aad);
		const future = stored.replace(/^v1\|/, "v9|");
		try {
			decryptValue(dataKey, future, aad);
			expect.unreachable("should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(EnvelopeError);
			expect((error as EnvelopeError).code).toBe("UNSUPPORTED_VERSION");
		}
	});

	it("rejects a value encrypted under a different DataKey", () => {
		const stored = encryptValue(generateDataKey(), "payload", aad);
		expect(() => decryptValue(dataKey, stored, aad)).toThrow(EnvelopeError);
	});
});

describe("rotation tiers (task 1.4)", () => {
	it("slot re-wrap leaves data ciphertext bytes untouched", async () => {
		const dataKey = generateDataKey();
		const aad: ValueAAD = { table: "accounts", rowId: 7, column: "name" };
		const dataCiphertext = encryptValue(dataKey, "Premium Bond", aad);

		// Enroll credential A (password), then rotate to credential B:
		// re-wrap the SAME DataKey — data ciphertext must be byte-identical.
		const oldSlotKey = await derivePasswordSlotKey("old-password", SALT_A);
		const newSlotKey = await derivePasswordSlotKey("new-password", SALT_B);
		const slotAAD = makeAAD();
		const oldWrapped = wrapSlot(dataKey, oldSlotKey, slotAAD);
		const newWrapped = wrapSlot(dataKey, newSlotKey, slotAAD);

		// Data untouched (byte-identical ciphertext) — re-wrap only rewrote
		// the slot row. Both slots unwrap to the SAME DataKey, which still
		// decrypts the original ciphertext.
		expect(unwrapSlot(newWrapped, newSlotKey, slotAAD).equals(dataKey)).toBe(
			true,
		);
		expect(decryptValue(dataKey, dataCiphertext, aad)).toBe("Premium Bond");
		expect(newWrapped.wrappedKey).not.toBe(oldWrapped.wrappedKey);
	});

	it("DataKey rotation produces new ciphertext + re-wrapped slots", () => {
		const oldDataKey = generateDataKey();
		const newDataKey = generateDataKey();
		const aad: ValueAAD = { table: "accounts", rowId: 7, column: "name" };
		const oldCiphertext = encryptValue(oldDataKey, "Premium Bond", aad);

		// Full rotation: new DataKey re-encrypts data…
		const newCiphertext = encryptValue(newDataKey, "Premium Bond", aad);
		expect(newCiphertext).not.toBe(oldCiphertext);
		// …and every remaining slot is re-wrapped over the NEW key.
		const slotKey = generateDataKey();
		const slotAAD = makeAAD();
		const reWrapped = wrapSlot(newDataKey, slotKey, slotAAD);
		expect(unwrapSlot(reWrapped, slotKey, slotAAD).equals(newDataKey)).toBe(
			true,
		);
		// Old ciphertext can no longer be read with the new key.
		expect(() => decryptValue(newDataKey, oldCiphertext, aad)).toThrow(
			EnvelopeError,
		);
	});
});
