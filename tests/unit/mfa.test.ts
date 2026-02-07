import { describe, it, expect } from 'vitest';
import { 
	generateTOTPSecret, 
	generateOTPAuthURL, 
	verifyTOTP, 
	generateBackupCodes,
	decryptTOTPSecret 
} from '$lib/auth/mfa';
import crypto from 'crypto';

describe('MFA utility', () => {
	it('should generate a valid TOTP secret', () => {
		const secret = generateTOTPSecret();
		expect(secret).toBeDefined();
		expect(typeof secret).toBe('string');
		expect(secret.length).toBeGreaterThan(0);
	});

	it('should generate a correct otpauth URL', () => {
		const secret = 'JBSWY3DPEHPK3PXP';
		const username = 'testuser';
		const url = generateOTPAuthURL(secret, username);
		
		expect(url).toContain('otpauth://totp/');
		expect(url).toContain('testuser');
		expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
		expect(url).toContain('issuer=Offline%20Finance%20Dashboard');
	});

	it('should generate valid backup codes', () => {
		const codes = generateBackupCodes();
		expect(codes).toHaveLength(10);
		codes.forEach(code => {
			expect(code).toMatch(/^[0-9A-F]{8}$/);
		});
	});

	it('should decrypt TOTP secret correctly', () => {
		// This test simulates how secrets are stored in the DB
		const systemKey = 'my-system-encryption-key';
		const plainSecret = 'JBSWY3DPEHPK3PXP';
		
		// Setup encrypted secret (same logic as in the app)
		const encryptionKey = crypto.createHash('sha256').update(systemKey).digest();
		const iv = crypto.randomBytes(12);
		const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
		let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
		encrypted += cipher.final('hex');
		const authTag = cipher.getAuthTag();
		
		const encryptedSecretWithTag = `${encrypted}:${authTag.toString('hex')}`;
		
		const decrypted = decryptTOTPSecret(
			encryptedSecretWithTag, 
			iv.toString('hex'), 
			systemKey
		);
		
		expect(decrypted).toBe(plainSecret);
	});

	it('should verify a recently generated TOTP token', async () => {
		// Note: This might be slightly flaky if time passes between generation and verification,
		// but with otplib and internal generation it usually works within the same second.
		const secret = generateTOTPSecret();
		
		// We use otplib directly to generate a token for testing verifyTOTP
		// This is just to test our wrapper function
		const { generate } = await import('otplib');
		const { NobleCryptoPlugin } = await import('@otplib/plugin-crypto-noble');
		const { ScureBase32Plugin } = await import('@otplib/plugin-base32-scure');

		const token = await generate({ 
			secret,
			crypto: new NobleCryptoPlugin(),
			base32: new ScureBase32Plugin(),
		});
		
		const isValid = await verifyTOTP(token, secret);
		expect(isValid).toBe(true);
	});
});
