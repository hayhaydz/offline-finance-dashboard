import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '$lib/auth/password';

describe('password utility', () => {
	it('should hash a password and verify it correctly', async () => {
		const password = 'my-secure-password';
		const hash = await hashPassword(password);
		
		expect(hash).toBeDefined();
		expect(hash).not.toBe(password);
		
		const isValid = await verifyPassword(hash, password);
		expect(isValid).toBe(true);
	});

	it('should not verify an incorrect password', async () => {
		const password = 'my-secure-password';
		const hash = await hashPassword(password);
		
		const isValid = await verifyPassword(hash, 'wrong-password');
		expect(isValid).toBe(false);
	});

	it('should generate different hashes for the same password due to salting', async () => {
		const password = 'my-secure-password';
		const hash1 = await hashPassword(password);
		const hash2 = await hashPassword(password);
		
		expect(hash1).not.toBe(hash2);
	});
});
