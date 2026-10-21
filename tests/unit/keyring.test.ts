import { afterEach, describe, expect, it } from "vitest";
import {
	clearRecoveryInitiated,
	decryptField,
	encryptField,
	generateDataKey,
	isUnlockedFor,
	keyringStatus,
	markRecoveryInitiated,
	SealedError,
	sealKeyring,
	unlockKeyring,
} from "$lib/server/crypto/keyring";

/**
 * Keyring state machine (design D6): sealed-by-default, ceremony to unlock,
 * seal on expiry/logout/exit. Pure in-memory — no DB.
 */

afterEach(() => {
	sealKeyring("test-teardown");
});

describe("keyring state machine", () => {
	it("boots sealed (fresh boot is sealed — spec envelope-encryption)", () => {
		sealKeyring("setup");
		const status = keyringStatus();
		expect(status.state).toBe("sealed");
		expect(status.userId).toBeNull();
	});

	it("unlock transitions to unlocked for that user", () => {
		sealKeyring("setup");
		unlockKeyring(7, generateDataKey());
		const status = keyringStatus();
		expect(status.state).toBe("unlocked");
		expect(status.userId).toBe(7);
		expect(isUnlockedFor(7)).toBe(true);
		expect(isUnlockedFor(8)).toBe(false);
	});

	it("seal wipes state and is idempotent", () => {
		unlockKeyring(7, generateDataKey());
		sealKeyring("logout");
		sealKeyring("logout");
		expect(keyringStatus().state).toBe("sealed");
		expect(isUnlockedFor(7)).toBe(false);
	});

	it("unlocking as a different user seals the previous state first", () => {
		unlockKeyring(7, generateDataKey());
		unlockKeyring(9, generateDataKey());
		expect(keyringStatus().userId).toBe(9);
		expect(isUnlockedFor(7)).toBe(false);
	});

	it("same-user re-unlock seals (zeroizes) the previous key first (key hygiene)", () => {
		const oldKey = generateDataKey();
		const newKey = generateDataKey();
		unlockKeyring(7, oldKey);
		expect(keyringStatus().userId).toBe(7);

		// Non-recovery re-unlock of the SAME user — the previous DataKey is
		// discarded zeroized via the seal path, not silently overwritten.
		unlockKeyring(7, newKey);
		expect(oldKey.every((b) => b === 0)).toBe(true);
		expect(newKey.every((b) => b === 0)).toBe(false);
		expect(isUnlockedFor(7)).toBe(true);
	});

	it("value-layer access throws typed SealedError while sealed", () => {
		sealKeyring("setup");
		expect(() =>
			encryptField(7, { table: "t", rowId: "r", column: "c" }, "x"),
		).toThrow(SealedError);
		expect(() =>
			decryptField(7, { table: "t", rowId: "r", column: "c" }, "v1|abc"),
		).toThrow(SealedError);
	});

	it("value-layer access throws SealedError for a different user even when unlocked", () => {
		unlockKeyring(7, generateDataKey());
		expect(() =>
			encryptField(8, { table: "t", rowId: "r", column: "c" }, "x"),
		).toThrow(SealedError);
	});

	it("recovery-initiated flag: set and clear", () => {
		unlockKeyring(7, generateDataKey(), { recoveryInitiated: true });
		expect(keyringStatus().recoveryInitiated).toBe(true);

		clearRecoveryInitiated(7);
		expect(keyringStatus().recoveryInitiated).toBe(false);

		markRecoveryInitiated(7);
		expect(keyringStatus().recoveryInitiated).toBe(true);
	});

	it("legacy plaintext values pass through decryptField (migration window)", () => {
		unlockKeyring(7, generateDataKey());
		const aad = { table: "t", rowId: "r", column: "c" };
		expect(decryptField(7, aad, "legacy plaintext")).toBe("legacy plaintext");
		expect(decryptField(7, aad, null)).toBeNull();

		const stored = encryptField(7, aad, "secret value");
		expect(stored.startsWith("v1|")).toBe(true);
		expect(decryptField(7, aad, stored)).toBe("secret value");
	});
});
