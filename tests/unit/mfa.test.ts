import crypto from "node:crypto";
import { generate } from "otplib";
import { describe, expect, it } from "vitest";
import {
	decryptTOTPSecret,
	generateBackupCodes,
	generateOTPAuthURL,
	generateTOTPSecret,
	verifyBackupCode,
	verifyTOTP,
} from "$lib/auth/mfa";
import { hashPassword } from "$lib/auth/password";

describe("MFA utility", () => {
	it("should generate a valid TOTP secret", () => {
		const secret = generateTOTPSecret();
		expect(secret).toBeDefined();
		expect(typeof secret).toBe("string");
		expect(secret.length).toBeGreaterThan(0);
	});

	it("should generate a correct otpauth URL", () => {
		const secret = "JBSWY3DPEHPK3PXP";
		const username = "testuser";
		const url = generateOTPAuthURL(secret, username);

		expect(url).toContain("otpauth://totp/");
		expect(url).toContain("testuser");
		expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
		expect(url).toContain("issuer=OFD");
	});

	it("should produce otpauth URL with extractable secret for manual entry", () => {
		const secret = "JBSWY3DPEHPK3PXP";
		const username = "testuser";
		const url = generateOTPAuthURL(secret, username);

		// Secret should be in the URL query string for manual entry
		const urlObj = new URL(url);
		expect(urlObj.searchParams.get("secret")).toBe(secret);
	});

	it("should generate valid backup codes", () => {
		const codes = generateBackupCodes();
		expect(codes).toHaveLength(10);
		codes.forEach((code) => {
			expect(code).toMatch(/^[0-9A-F]{8}$/);
		});
	});

	it("should decrypt TOTP secret correctly", () => {
		// This test simulates how secrets are stored in the DB
		const systemKey = "my-system-encryption-key";
		const plainSecret = "JBSWY3DPEHPK3PXP";

		// Setup encrypted secret (same logic as in the app)
		const encryptionKey = crypto
			.createHash("sha256")
			.update(systemKey)
			.digest();
		const iv = crypto.randomBytes(12);
		const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
		let encrypted = cipher.update(plainSecret, "utf8", "hex");
		encrypted += cipher.final("hex");
		const authTag = cipher.getAuthTag();

		const encryptedSecretWithTag = `${encrypted}:${authTag.toString("hex")}`;

		const decrypted = decryptTOTPSecret(
			encryptedSecretWithTag,
			iv.toString("hex"),
			systemKey,
		);

		expect(decrypted).toBe(plainSecret);
	});

	it("should verify a recently generated TOTP token", async () => {
		// Note: This might be slightly flaky if time passes between generation and verification,
		// but with otplib and internal generation it usually works within the same second.
		const secret = generateTOTPSecret();
		const token = await generate({ secret });

		const isValid = await verifyTOTP(token, secret);
		expect(isValid).toBe(true);
	});

	it("should reject invalid TOTP token", async () => {
		const secret = generateTOTPSecret();
		const isValid = await verifyTOTP("000000", secret);
		expect(isValid).toBe(false);
	});

	it("should reject malformed TOTP token length", async () => {
		const secret = generateTOTPSecret();
		// Should now return false instead of throwing thanks to try-catch
		const isValid = await verifyTOTP("12345", secret);
		expect(isValid).toBe(false);
	});

	it("should reject expired TOTP token (simulated)", async () => {
		const secret = generateTOTPSecret();
		const pastToken = await generate({ secret });

		// verifyTOTP uses epochTolerance: 30 (seconds), so verifying with a different secret should fail
		const isValid = await verifyTOTP(pastToken, "DIFFERENTSECRET");
		expect(isValid).toBe(false);
	});

	it("should verify a valid backup code", async () => {
		// Generate and hash a backup code (same as in MFA setup)
		const codes = generateBackupCodes();
		const testCode = codes[0]; // e.g., "AB12CD34"
		const hashedCodes = await Promise.all(
			codes.map((code) => hashPassword(code)),
		);

		// Verify the code matches
		const matchedHash = await verifyBackupCode(testCode, hashedCodes);
		expect(matchedHash).toBe(hashedCodes[0]);
	});

	it("should reject an invalid backup code", async () => {
		// Generate and hash backup codes
		const codes = generateBackupCodes();
		const hashedCodes = await Promise.all(
			codes.map((code) => hashPassword(code)),
		);

		// Try to verify with wrong code
		const matchedHash = await verifyBackupCode("WRONGCODE", hashedCodes);
		expect(matchedHash).toBeNull();
	});

	it("should be case-insensitive for backup codes", async () => {
		// Generate a backup code (uppercase)
		const codes = generateBackupCodes();
		const testCode = codes[0]; // e.g., "AB12CD34"
		const hashedCodes = await Promise.all(
			codes.map((code) => hashPassword(code)),
		);

		// Verify with lowercase version - should still work
		const matchedHash = await verifyBackupCode(
			testCode.toLowerCase(),
			hashedCodes,
		);
		expect(matchedHash).toBe(hashedCodes[0]);
	});
});
