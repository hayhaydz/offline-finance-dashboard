import { describe, it, expect } from 'vitest';
import { deriveKeyFromPassword, encryptUserData, decryptUserData } from '$lib/auth/encryption';

describe('encryption utility', () => {
	const password = 'user-secret-password';
	const salt = 'random-salt-value';
	const secretData = 'This is some sensitive financial data';

	it('should derive the same key from the same password and salt', () => {
		const key1 = deriveKeyFromPassword(password, salt);
		const key2 = deriveKeyFromPassword(password, salt);
		
		expect(key1).toEqual(key2);
		expect(key1.length).toBe(32); // 256-bit key
	});

	it('should derive different keys for different passwords or salts', () => {
		const key1 = deriveKeyFromPassword(password, salt);
		const key2 = deriveKeyFromPassword('different-password', salt);
		const key3 = deriveKeyFromPassword(password, 'different-salt');
		
		expect(key1).not.toEqual(key2);
		expect(key1).not.toEqual(key3);
	});

	it('should encrypt and decrypt data correctly', () => {
		const key = deriveKeyFromPassword(password, salt);
		const { encrypted, iv } = encryptUserData(secretData, key);
		
		expect(encrypted).toBeDefined();
		expect(iv).toBeDefined();
		expect(encrypted).not.toBe(secretData);
		
		const decrypted = decryptUserData(encrypted, iv, key);
		expect(decrypted).toBe(secretData);
	});

	it('should fail to decrypt with the wrong key', () => {
		const key = deriveKeyFromPassword(password, salt);
		const wrongKey = deriveKeyFromPassword('wrong-password', salt);
		const { encrypted, iv } = encryptUserData(secretData, key);
		
		expect(() => {
			decryptUserData(encrypted, iv, wrongKey);
		}).toThrow();
	});
});
