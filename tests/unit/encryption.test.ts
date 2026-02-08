import { describe, it, expect } from 'vitest';
import { deriveKeyFromPassword, encryptUserData, decryptUserData } from '$lib/auth/encryption';

describe('encryption utility', () => {
	const password = 'user-secret-password';
	const salt = 'random-salt-value';
	const secretData = 'This is some sensitive financial data';

	it('should derive the same key from the same password and salt', async () => {
		const key1 = await deriveKeyFromPassword(password, salt);
		const key2 = await deriveKeyFromPassword(password, salt);
		
		expect(key1).toEqual(key2);
		expect(key1.length).toBe(32); // 256-bit key
	});

	it('should derive different keys for different passwords or salts', async () => {
		const key1 = await deriveKeyFromPassword(password, salt);
		const key2 = await deriveKeyFromPassword('different-password', salt);
		const key3 = await deriveKeyFromPassword(password, 'different-salt');
		
		expect(key1).not.toEqual(key2);
		expect(key1).not.toEqual(key3);
	});

	it('should encrypt and decrypt data correctly', async () => {
		const key = await deriveKeyFromPassword(password, salt);
		const { encrypted, iv } = encryptUserData(secretData, key);
		
		expect(encrypted).toBeDefined();
		expect(iv).toBeDefined();
		expect(encrypted).not.toBe(secretData);
		
		const decrypted = decryptUserData(encrypted, iv, key);
		expect(decrypted).toBe(secretData);
	});

	it('should fail to decrypt with the wrong key', async () => {
		const key = await deriveKeyFromPassword(password, salt);
		const wrongKey = await deriveKeyFromPassword('wrong-password', salt);
		const { encrypted, iv } = encryptUserData(secretData, key);
		
		expect(() => {
			decryptUserData(encrypted, iv, wrongKey);
		}).toThrow();
	});

	it('should handle empty string correctly', async () => {
		const key = await deriveKeyFromPassword(password, salt);
		const emptyData = '';
		const { encrypted, iv } = encryptUserData(emptyData, key);
		
		const decrypted = decryptUserData(encrypted, iv, key);
		expect(decrypted).toBe('');
	});

	it('should handle large data correctly', async () => {
		const key = await deriveKeyFromPassword(password, salt);
		const largeData = 'a'.repeat(1024 * 1024); // 1MB of data
		const { encrypted, iv } = encryptUserData(largeData, key);
		
		const decrypted = decryptUserData(encrypted, iv, key);
		expect(decrypted).toBe(largeData);
	});
});
